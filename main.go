package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime/debug"
	"sort"
	"strings"

	"github.com/micromdm/plist"
)

type PlistData map[string]interface{}

var version = "0.1.0"

var data PlistData
var itemByUUID map[string]map[string]interface{}
var catNames []string
var activePlistFile string
var activeKeyFile string

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

func loadPlist(raw []byte, keyHex string) (PlistData, error) {
	if keyHex != "" {
		var err error
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

	cats := make([]Category, 0)
	for _, name := range catNames {
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

	items := make([]ItemSummary, 0)
	for _, item := range arr {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		items = append(items, toItemSummary(m))
	}

	writeJSON(w, items)
}

func handleItemDetail(w http.ResponseWriter, r *http.Request) {
	uuid := r.PathValue("uuid")
	if m, ok := itemByUUID[uuid]; ok {
		writeJSON(w, m)
		return
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
		SortDate      int    `json:"sortDate"`
	}

	results := make([]SearchResult, 0)
	for _, name := range catNames {
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
					SortDate:      intVal(m, "SortDate"),
				})
			}
		}
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].SortDate > results[j].SortDate
	})

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

func reloadData() error {
	raw, err := os.ReadFile(activePlistFile)
	if err != nil {
		return fmt.Errorf("read %s: %w", activePlistFile, err)
	}

	var keyHex string
	if validatePlist(raw) == nil {
		log.Printf("Loading plaintext plist from %s", activePlistFile)
	} else {
		keyBytes, err := os.ReadFile(activeKeyFile)
		if err != nil {
			return fmt.Errorf("data file %s appears encrypted but no key found at %s", activePlistFile, activeKeyFile)
		}
		keyHex = strings.TrimSpace(string(keyBytes))
		log.Printf("Loading encrypted plist from %s (key from %s)", activePlistFile, activeKeyFile)
	}

	newData, err := loadPlist(raw, keyHex)
	if err != nil {
		return fmt.Errorf("load plist: %w", err)
	}

	// Pre-sort each category's items newest-first
	for k, v := range newData {
		if arr, ok := v.([]interface{}); ok {
			sort.Slice(arr, func(i, j int) bool {
				mi, _ := arr[i].(map[string]interface{})
				mj, _ := arr[j].(map[string]interface{})
				return intVal(mi, "SortDate") > intVal(mj, "SortDate")
			})
			newData[k] = arr
		}
	}

	// Extract color lookup table and resolve ColorValue UUIDs in items
	colorLookup := make(map[string]map[string]interface{})
	if md, ok := newData["MactrackerData"].(map[string]interface{}); ok {
		if cd, ok := md["ColorDetails"].(map[string]interface{}); ok {
			for uuid, v := range cd {
				if detail, ok := v.(map[string]interface{}); ok {
					colorLookup[uuid] = detail
				}
			}
		}
	}

	// Build UUID index for O(1) item lookups
	newIndex := make(map[string]map[string]interface{})
	for _, v := range newData {
		arr, ok := v.([]interface{})
		if !ok {
			continue
		}
		for _, item := range arr {
			m, ok := item.(map[string]interface{})
			if !ok {
				continue
			}
			if uuid := strVal(m, "UUID"); uuid != "" {
				newIndex[uuid] = m
			}
			// Resolve ColorValue UUIDs to {name, hex} objects
			if cvArr, ok := m["ColorValue"].([]interface{}); ok && len(colorLookup) > 0 {
				resolved := make([]interface{}, 0, len(cvArr))
				for _, cv := range cvArr {
					uid, ok := cv.(string)
					if !ok {
						continue
					}
					if detail, found := colorLookup[uid]; found {
						resolved = append(resolved, map[string]interface{}{
							"name": strVal(detail, "Name"),
							"hex":  strVal(detail, "Value"),
						})
					}
				}
				m["ColorValue"] = resolved
			}
		}
	}

	data = newData
	itemByUUID = newIndex
	catNames = categoryNames(data)

	log.Printf("Loaded %d top-level keys, %d categories", len(data), len(catNames))
	totalItems := 0
	for _, name := range catNames {
		arr := data[name].([]interface{})
		log.Printf("  %-25s %4d items", name, len(arr))
		totalItems += len(arr)
	}
	log.Printf("Total: %d items across %d categories", totalItems, len(catNames))
	return nil
}

func handleUpload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 256<<20) // 256 MB limit

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "failed to read upload: "+err.Error(), http.StatusBadRequest)
		return
	}
	defer file.Close()

	fileData, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "failed to read file data: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Determine save path based on uploaded filename extension
	ext := filepath.Ext(header.Filename)
	savePath := "data/CoreCollection.data"
	if ext == ".plist" {
		savePath = "data/CoreCollection.plist"
	}

	if err := os.MkdirAll("data", 0755); err != nil {
		http.Error(w, "failed to create data directory: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if err := os.WriteFile(savePath, fileData, 0644); err != nil {
		http.Error(w, "failed to save file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	activePlistFile = savePath
	log.Printf("Uploaded %s (%d bytes), saved to %s", header.Filename, len(fileData), savePath)

	reloadErr := reloadData()

	totalItems := 0
	if data != nil {
		for _, name := range catNames {
			arr := data[name].([]interface{})
			totalItems += len(arr)
		}
	}

	result := map[string]interface{}{
		"ok":         true,
		"categories": len(catNames),
		"items":      totalItems,
		"savedTo":    savePath,
	}

	if reloadErr != nil {
		result["loaded"] = false
		result["info"] = reloadErr.Error()
	} else {
		result["loaded"] = true
	}

	writeJSON(w, result)
}

func main() {
	plistPath := flag.String("plist", "", "path to plist file (auto-detects if not set)")
	keyFile := flag.String("key", "data/key", "path to key file")
	port := flag.String("port", "8080", "listen port")
	dumpJSON := flag.Bool("json", false, "output entire database as JSON to stdout and exit")
	flag.Parse()

	// Determine plist file path
	activePlistFile = *plistPath
	if activePlistFile == "" {
		if _, err := os.Stat("data/CoreCollection.plist"); err == nil {
			activePlistFile = "data/CoreCollection.plist"
		} else if _, err := os.Stat("data/CoreCollection.data"); err == nil {
			activePlistFile = "data/CoreCollection.data"
		} else {
			log.Printf("No plist file found — upload one at /upload.html")
		}
	}
	activeKeyFile = *keyFile

	if *dumpJSON {
		log.SetOutput(io.Discard)
		if activePlistFile == "" {
			fmt.Fprintln(os.Stderr, "no data file found")
			os.Exit(1)
		}
		if err := reloadData(); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(data); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}

	if activePlistFile != "" {
		if err := reloadData(); err != nil {
			log.Printf("Could not load data: %v — upload key or data at /upload.html", err)
		}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/categories", handleCategories)
	mux.HandleFunc("GET /api/categories/{name}", handleCategoryItems)
	mux.HandleFunc("GET /api/items/{uuid}", handleItemDetail)
	mux.HandleFunc("GET /api/search", handleSearch)
	mux.HandleFunc("GET /api/sideboard", handleSideboard)
	mux.HandleFunc("GET /api/filter", handleFilter)
	mux.HandleFunc("GET /api/multicategory", handleMultiCategory)
	mux.HandleFunc("GET /api/lookup", handleModelLookup)
	mux.HandleFunc("POST /api/upload", handleUpload)
	mux.HandleFunc("POST /api/reload", func(w http.ResponseWriter, r *http.Request) {
		if activePlistFile == "" {
			writeJSON(w, map[string]interface{}{"ok": false, "message": "No data file configured"})
			return
		}
		err := reloadData()
		if err != nil {
			writeJSON(w, map[string]interface{}{"ok": false, "message": err.Error()})
			return
		}
		totalItems := 0
		for _, name := range catNames {
			arr := data[name].([]interface{})
			totalItems += len(arr)
		}
		writeJSON(w, map[string]interface{}{"ok": true, "categories": len(catNames), "items": totalItems})
	})
	mux.HandleFunc("GET /api/status", func(w http.ResponseWriter, r *http.Request) {
		_, plistErr := os.Stat("data/CoreCollection.plist")
		_, dataErr := os.Stat("data/CoreCollection.data")
		_, keyErr := os.Stat(activeKeyFile)

		totalItems := 0
		if data != nil {
			for _, name := range catNames {
				arr := data[name].([]interface{})
				totalItems += len(arr)
			}
		}

		buildInfo := map[string]string{}
		if info, ok := debug.ReadBuildInfo(); ok {
			buildInfo["go"] = info.GoVersion
			for _, s := range info.Settings {
				switch s.Key {
				case "vcs.revision":
					buildInfo["commit"] = s.Value
				case "vcs.time":
					buildInfo["commitTime"] = s.Value
				case "vcs.modified":
					buildInfo["dirty"] = s.Value
				}
			}
		}

		writeJSON(w, map[string]interface{}{
			"plistExists": plistErr == nil,
			"dataExists":  dataErr == nil,
			"keyExists":   keyErr == nil,
			"loaded":      data != nil,
			"categories":  len(catNames),
			"items":       totalItems,
			"version":     version,
			"build":       buildInfo,
		})
	})
	mux.HandleFunc("POST /api/validate-key", func(w http.ResponseWriter, r *http.Request) {
		keyHex := strings.TrimSpace(r.URL.Query().Get("key"))
		if keyHex == "" {
			body, _ := io.ReadAll(r.Body)
			keyHex = strings.TrimSpace(string(body))
		}

		raw, err := os.ReadFile(activePlistFile)
		if err != nil {
			writeJSON(w, map[string]interface{}{"valid": false, "message": "No data file found: " + err.Error()})
			return
		}

		if validatePlist(raw) == nil {
			writeJSON(w, map[string]interface{}{"valid": true, "message": "Data file is plaintext XML — no key needed."})
			return
		}

		if keyHex == "" {
			writeJSON(w, map[string]interface{}{"valid": false, "message": "Data file is encrypted but no key provided."})
			return
		}

		_, err = decryptData(raw, keyHex)
		if err != nil {
			writeJSON(w, map[string]interface{}{"valid": false, "message": err.Error()})
			return
		}

		writeJSON(w, map[string]interface{}{"valid": true, "message": "Key is valid — decrypts to valid XML plist."})
	})
	mux.HandleFunc("GET /key", func(w http.ResponseWriter, r *http.Request) {
		content, err := os.ReadFile(activeKeyFile)
		if err != nil {
			http.Error(w, "key not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/plain")
		w.Write(content)
	})
	mux.HandleFunc("POST /key", func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "failed to read body", http.StatusBadRequest)
			return
		}
		if err := os.WriteFile(activeKeyFile, body, 0600); err != nil {
			http.Error(w, "failed to write key", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("GET /upload", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "static/upload.html")
	})
	mux.HandleFunc("GET /api", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "static/api.html")
	})
	fileServer := http.FileServer(http.Dir("static"))
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" && data == nil {
			// Try to auto-detect and reload before redirecting
			if activePlistFile == "" {
				if _, err := os.Stat("data/CoreCollection.plist"); err == nil {
					activePlistFile = "data/CoreCollection.plist"
				} else if _, err := os.Stat("data/CoreCollection.data"); err == nil {
					activePlistFile = "data/CoreCollection.data"
				}
			}
			if activePlistFile != "" {
				reloadData()
			}
			if data == nil {
				http.Redirect(w, r, "/upload", http.StatusTemporaryRedirect)
				return
			}
		}
		fileServer.ServeHTTP(w, r)
	})

	listenAddr := ":" + *port
	log.Printf("Server starting on http://localhost:%s", *port)
	log.Fatal(http.ListenAndServe(listenAddr, mux))
}
