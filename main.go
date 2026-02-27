package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"

	"github.com/micromdm/plist"
)

type PlistData map[string]interface{}

var data PlistData

// sanitizeXML strips control characters that are illegal in XML 1.0
// (anything < 0x20 except tab, newline, carriage return).
func sanitizeXML(b []byte) []byte {
	line := 1
	col := 0
	out := make([]byte, 0, len(b))
	for _, c := range b {
		col++
		if c == 0x0A {
			line++
			col = 0
		}
		if c < 0x20 && c != 0x09 && c != 0x0A && c != 0x0D {
			log.Printf("WARNING: stripped illegal XML character U+%04X at line %d, col %d", c, line, col)
			continue
		}
		out = append(out, c)
	}
	return out
}

func loadPlist(path string, keyHex string) (PlistData, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read plist: %w", err)
	}
	log.Printf("Read %d bytes from %s", len(raw), path)

	if keyHex != "" {
		raw, err = decryptData(raw, keyHex)
		if err != nil {
			return nil, err
		}
	}

	clean := sanitizeXML(raw)

	var d PlistData
	decoder := plist.NewDecoder(bytes.NewReader(clean))
	if err := decoder.Decode(&d); err != nil {
		return nil, fmt.Errorf("decode plist: %w", err)
	}
	return d, nil
}

// categoryNames returns sorted list of keys whose values are arrays of dicts (product categories).
func categoryNames(d PlistData) []string {
	var names []string
	for k, v := range d {
		if arr, ok := v.([]interface{}); ok && len(arr) > 0 {
			if _, ok := arr[0].(map[string]interface{}); ok {
				names = append(names, k)
			}
		}
	}
	sort.Strings(names)
	return names
}

func handleCategories(w http.ResponseWriter, r *http.Request) {
	type Category struct {
		Name  string `json:"name"`
		Count int    `json:"count"`
	}

	var cats []Category
	for _, name := range categoryNames(data) {
		arr := data[name].([]interface{})
		cats = append(cats, Category{Name: name, Count: len(arr)})
	}

	writeJSON(w, cats)
}

func handleCategoryItems(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")

	val, ok := data[name]
	if !ok {
		http.Error(w, "category not found", http.StatusNotFound)
		return
	}

	arr, ok := val.([]interface{})
	if !ok {
		http.Error(w, "not a category", http.StatusBadRequest)
		return
	}

	var items []ItemSummary
	for _, item := range arr {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		items = append(items, toItemSummary(m))
	}

	sortItemsNewestFirst(items)
	writeJSON(w, items)
}

func handleItemDetail(w http.ResponseWriter, r *http.Request) {
	uuid := r.PathValue("uuid")

	for _, name := range categoryNames(data) {
		arr := data[name].([]interface{})
		for _, item := range arr {
			m, ok := item.(map[string]interface{})
			if !ok {
				continue
			}
			if strVal(m, "UUID") == uuid {
				writeJSON(w, m)
				return
			}
		}
	}

	http.Error(w, "item not found", http.StatusNotFound)
}

func handleSearch(w http.ResponseWriter, r *http.Request) {
	query := strings.ToLower(r.URL.Query().Get("q"))
	if query == "" {
		writeJSON(w, []interface{}{})
		return
	}

	type SearchResult struct {
		UUID          string `json:"uuid"`
		ModelName     string `json:"modelName"`
		AppleFileIcon string `json:"appleFileIcon"`
		Category      string `json:"category"`
		Introduction  string `json:"introduction"`
		SupportStatus string `json:"supportStatus"`
	}

	var results []SearchResult
	for _, name := range categoryNames(data) {
		arr := data[name].([]interface{})
		for _, item := range arr {
			m, ok := item.(map[string]interface{})
			if !ok {
				continue
			}
			modelName := strVal(m, "ModelName")
			if strings.Contains(strings.ToLower(modelName), query) || modelMatches(m, strings.ToUpper(query)) {
				results = append(results, SearchResult{
					UUID:          strVal(m, "UUID"),
					ModelName:     modelName,
					AppleFileIcon: strVal(m, "AppleFileIcon"),
					Category:      name,
					Introduction:  strVal(m, "Introduction"),
					SupportStatus: strVal(m, "SupportStatus"),
				})
			}
		}
	}

	writeJSON(w, results)
}

func strVal(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func intVal(m map[string]interface{}, key string) int {
	if v, ok := m[key]; ok {
		switch n := v.(type) {
		case int:
			return n
		case int64:
			return int(n)
		case float64:
			return int(n)
		case uint64:
			return int(n)
		}
	}
	return 0
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	if err := enc.Encode(v); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func main() {
	plistPath := flag.String("plist", "data/CoreCollection.data", "path to plist file")
	keyFile := flag.String("key", "data/key", "path to key file (optional, omit or leave empty for plaintext plist)")
	addr := flag.String("addr", ":8080", "listen address")
	flag.Parse()

	// Try to read key from file
	var keyHex string
	if *keyFile != "" {
		keyBytes, err := os.ReadFile(*keyFile)
		if err == nil {
			keyHex = strings.TrimSpace(string(keyBytes))
			log.Printf("Loaded decryption key from %s", *keyFile)
		} else if !os.IsNotExist(err) {
			log.Fatalf("Failed to read key file %s: %v", *keyFile, err)
		} else {
			log.Printf("No key file found at %s, loading plist as plaintext", *keyFile)
		}
	}

	log.Printf("Loading plist from %s...", *plistPath)
	if keyHex != "" {
		log.Printf("Decryption enabled (AES-128-CBC, zero IV)")
	} else {
		log.Printf("No decryption key, loading as plaintext")
	}

	var err error
	data, err = loadPlist(*plistPath, keyHex)
	if err != nil {
		log.Fatalf("Failed to load plist: %v", err)
	}

	cats := categoryNames(data)
	log.Printf("Loaded %d top-level keys, %d categories", len(data), len(cats))
	totalItems := 0
	for _, name := range cats {
		arr := data[name].([]interface{})
		log.Printf("  %-25s %4d items", name, len(arr))
		totalItems += len(arr)
	}
	log.Printf("Total: %d items across %d categories", totalItems, len(cats))

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/categories", handleCategories)
	mux.HandleFunc("GET /api/categories/{name}", handleCategoryItems)
	mux.HandleFunc("GET /api/items/{uuid}", handleItemDetail)
	mux.HandleFunc("GET /api/search", handleSearch)
	mux.HandleFunc("GET /api/sideboard", handleSideboard)
	mux.HandleFunc("GET /api/filter", handleFilter)
	mux.HandleFunc("GET /api/multicategory", handleMultiCategory)
	mux.HandleFunc("GET /api/lookup", handleModelLookup)
	mux.Handle("GET /", http.FileServer(http.Dir("static")))

	log.Printf("Server starting on http://localhost%s", *addr)
	log.Fatal(http.ListenAndServe(*addr, mux))
}
