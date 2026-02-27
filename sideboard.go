package main

import (
	"net/http"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

func sortItemsNewestFirst(items []ItemSummary) {
	sort.Slice(items, func(i, j int) bool {
		return items[i].SortDate > items[j].SortDate
	})
}

// ItemSummary is the compact representation returned for list views.
type ItemSummary struct {
	UUID             string `json:"uuid"`
	ModelName        string `json:"modelName"`
	AppleFileIcon    string `json:"appleFileIcon"`
	Introduction     string `json:"introduction"`
	Discontinued     string `json:"discontinued"`
	Processor        string `json:"processor"`
	SupportStatus    string `json:"supportStatus"`
	Tagline          string `json:"tagline"`
	PurchasePriceUSD string `json:"purchasePriceUSD"`
	SortDate         int    `json:"sortDate"`
}

func toItemSummary(m map[string]interface{}) ItemSummary {
	return ItemSummary{
		UUID:             strVal(m, "UUID"),
		ModelName:        strVal(m, "ModelName"),
		AppleFileIcon:    strVal(m, "AppleFileIcon"),
		Introduction:     strVal(m, "Introduction"),
		Discontinued:     strVal(m, "Discontinued"),
		Processor:        strVal(m, "Processor"),
		SupportStatus:    strVal(m, "SupportStatus"),
		Tagline:          strVal(m, "Tagline"),
		PurchasePriceUSD: strVal(m, "PurchasePriceUSD"),
		SortDate:         intVal(m, "SortDate"),
	}
}

// handleSideboard serves the sideboard.json config, reading from disk each
// time so edits are reflected without a restart.
func handleSideboard(w http.ResponseWriter, r *http.Request) {
	raw, err := os.ReadFile("sideboard.json")
	if err != nil {
		http.Error(w, "sideboard config not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(raw)
}

// handleMultiCategory merges items from multiple plist categories.
// Query param: names (comma-separated category keys).
func handleMultiCategory(w http.ResponseWriter, r *http.Request) {
	namesParam := r.URL.Query().Get("names")
	if namesParam == "" {
		http.Error(w, "missing names parameter", http.StatusBadRequest)
		return
	}

	names := strings.Split(namesParam, ",")
	items := make([]ItemSummary, 0)
	for _, name := range names {
		name = strings.TrimSpace(name)
		val, ok := data[name]
		if !ok {
			continue
		}
		arr, ok := val.([]interface{})
		if !ok {
			continue
		}
		for _, item := range arr {
			m, ok := item.(map[string]interface{})
			if !ok {
				continue
			}
			items = append(items, toItemSummary(m))
		}
	}

	sortItemsNewestFirst(items)
	writeJSON(w, items)
}

// handleFilter applies a dynamic filter rule across categories.
// Query params: field, op, value, categories (optional, comma-separated).
func handleFilter(w http.ResponseWriter, r *http.Request) {
	field := r.URL.Query().Get("field")
	op := r.URL.Query().Get("op")
	value := r.URL.Query().Get("value")

	if field == "" || op == "" {
		http.Error(w, "missing field or op parameter", http.StatusBadRequest)
		return
	}

	var cats []string
	if catsParam := r.URL.Query().Get("categories"); catsParam != "" {
		cats = strings.Split(catsParam, ",")
		for i := range cats {
			cats[i] = strings.TrimSpace(cats[i])
		}
	} else {
		cats = catNames
	}

	items := make([]ItemSummary, 0)
	for _, catName := range cats {
		val, ok := data[catName]
		if !ok {
			continue
		}
		arr, ok := val.([]interface{})
		if !ok {
			continue
		}
		for _, item := range arr {
			m, ok := item.(map[string]interface{})
			if !ok {
				continue
			}
			if matchFilter(strVal(m, field), op, value) {
				items = append(items, toItemSummary(m))
			}
		}
	}

	sortItemsNewestFirst(items)
	writeJSON(w, items)
}

// stripOrderSuffix removes the region/suffix portion of an order number.
// "MX2E3LL/A" → "MX2E3", "MRQY2LL/A" → "MRQY2"
func stripOrderSuffix(s string) string {
	s = strings.ToUpper(strings.TrimSpace(s))
	// Drop "/A", "/B" etc.
	if i := strings.LastIndex(s, "/"); i > 0 {
		s = s[:i]
	}
	// Drop trailing region code letters (e.g. "LL", "X") keeping ≥4 chars.
	for len(s) > 4 && s[len(s)-1] >= 'A' && s[len(s)-1] <= 'Z' {
		s = s[:len(s)-1]
	}
	return s
}

// handleModelLookup is a unified smart lookup.  GET /api/lookup?q=...
// Accepts order numbers (MX2E3LL/A), family numbers (A3401), or
// machine IDs (Mac16,8).  Returns the full item detail on match.
func handleModelLookup(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimSpace(r.URL.Query().Get("q"))
	if raw == "" {
		http.Error(w, "missing model number", http.StatusBadRequest)
		return
	}
	query := strings.ToUpper(raw)

	for _, catName := range catNames {
		arr, ok := data[catName].([]interface{})
		if !ok {
			continue
		}
		for _, item := range arr {
			m, ok := item.(map[string]interface{})
			if !ok {
				continue
			}
			if modelMatches(m, query) {
				writeJSON(w, m)
				return
			}
		}
	}

	http.Error(w, "model not found", http.StatusNotFound)
}

func modelMatches(m map[string]interface{}, query string) bool {
	// 1. MachID substring match (e.g. "Mac16,8" within "Mac16,8 (M4 Pro) Mac16,6 (M4 Max)")
	if machID := strVal(m, "MachID"); machID != "" {
		if strings.Contains(strings.ToUpper(machID), strings.ToUpper(query)) {
			return true
		}
	}

	// 2. FamilyNumber substring match (e.g. "A3401")
	if familyNum := strVal(m, "FamilyNumber"); familyNum != "" {
		if strings.Contains(strings.ToUpper(familyNum), strings.ToUpper(query)) {
			return true
		}
	}

	// 3. OrderNumber substring match
	if orderNum := strVal(m, "OrderNumber"); orderNum != "" {
		if strings.Contains(strings.ToUpper(orderNum), strings.ToUpper(query)) {
			return true
		}
	}

	return false
}

// fieldTokenMatch splits a comma-separated field and checks if any
// token (with parenthetical stripped) matches query exactly.
func fieldTokenMatch(field, query string) bool {
	if field == "" {
		return false
	}
	for _, part := range strings.Split(field, ",") {
		token := strings.TrimSpace(part)
		if idx := strings.Index(token, "("); idx > 0 {
			token = strings.TrimSpace(token[:idx])
		}
		if strings.EqualFold(token, query) {
			return true
		}
	}
	return false
}

// fieldTokenMatchStripped is like fieldTokenMatch but also strips
// order suffixes from each token before comparing.
func fieldTokenMatchStripped(field, strippedQuery string) bool {
	if field == "" {
		return false
	}
	for _, part := range strings.Split(field, ",") {
		token := strings.TrimSpace(part)
		if idx := strings.Index(token, "("); idx > 0 {
			token = strings.TrimSpace(token[:idx])
		}
		if stripOrderSuffix(token) == strippedQuery {
			return true
		}
	}
	return false
}

func matchFilter(fieldVal, op, value string) bool {
	switch op {
	case "eq":
		return strings.EqualFold(fieldVal, value)
	case "contains":
		return strings.Contains(strings.ToLower(fieldVal), strings.ToLower(value))
	case "prefix":
		return strings.HasPrefix(strings.ToLower(fieldVal), strings.ToLower(value))
	case "regex":
		re, err := regexp.Compile(value)
		if err != nil {
			return false
		}
		return re.MatchString(fieldVal)
	case "gt":
		a, err1 := strconv.ParseFloat(fieldVal, 64)
		b, err2 := strconv.ParseFloat(value, 64)
		if err1 != nil || err2 != nil {
			return fieldVal > value
		}
		return a > b
	case "lt":
		a, err1 := strconv.ParseFloat(fieldVal, 64)
		b, err2 := strconv.ParseFloat(value, 64)
		if err1 != nil || err2 != nil {
			return fieldVal < value
		}
		return a < b
	default:
		return false
	}
}
