package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"encoding/hex"
	"fmt"
	"log"
)

func isHexChar(b byte) bool {
	return (b >= '0' && b <= '9') || (b >= 'a' && b <= 'f') || (b >= 'A' && b <= 'F')
}

// isHexEncoded checks if the data looks like hex-encoded ASCII
// by sampling the first 128 non-whitespace bytes for valid hex characters.
func isHexEncoded(data []byte) bool {
	count := 0
	for _, b := range data {
		if b == ' ' || b == '\t' || b == '\r' || b == '\n' {
			continue
		}
		if !isHexChar(b) {
			return false
		}
		count++
		if count >= 128 {
			break
		}
	}
	return count >= 2
}

// decryptBlock decrypts a single AES-128-CBC block (one hex line → binary → decrypt).
// Each line is independently encrypted with a zero IV.
func decryptBlock(ciphertext, key []byte) ([]byte, error) {
	if len(ciphertext) == 0 {
		return nil, nil
	}
	if len(ciphertext)%aes.BlockSize != 0 {
		return nil, fmt.Errorf("ciphertext length %d is not a multiple of block size %d", len(ciphertext), aes.BlockSize)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("create cipher: %w", err)
	}

	iv := make([]byte, aes.BlockSize) // zero IV per line
	mode := cipher.NewCBCDecrypter(block, iv)

	plaintext := make([]byte, len(ciphertext))
	mode.CryptBlocks(plaintext, ciphertext)

	// Strip PKCS#7 padding: check last byte
	padLen := int(plaintext[len(plaintext)-1])
	if padLen >= 1 && padLen <= aes.BlockSize {
		valid := true
		for i := len(plaintext) - padLen; i < len(plaintext); i++ {
			if plaintext[i] != byte(padLen) {
				valid = false
				break
			}
		}
		if valid {
			plaintext = plaintext[:len(plaintext)-padLen]
		}
	}

	return plaintext, nil
}

// validatePlist checks that decrypted data looks like a valid XML plist.
func validatePlist(data []byte) error {
	if len(data) < 10 {
		return fmt.Errorf("decrypted data too short (%d bytes), likely bad key", len(data))
	}

	trimmed := bytes.TrimLeft(data, " \t\r\n")
	if !bytes.HasPrefix(trimmed, []byte("<?xml")) && !bytes.HasPrefix(trimmed, []byte("<!DOCTYPE")) && !bytes.HasPrefix(trimmed, []byte("<plist")) {
		preview := trimmed
		if len(preview) > 64 {
			preview = preview[:64]
		}
		return fmt.Errorf("decrypted data does not look like an XML plist (starts with: %q)", preview)
	}

	return nil
}

// decryptData takes raw file bytes and a hex-encoded AES-128 key.
// The file is expected to be hex-encoded ciphertext with one independently
// encrypted chunk per line (each line uses CBC with a fresh zero IV).
func decryptData(raw []byte, keyHex string) ([]byte, error) {
	key, err := hex.DecodeString(keyHex)
	if err != nil {
		return nil, fmt.Errorf("decode hex key: %w", err)
	}
	if len(key) != 16 {
		return nil, fmt.Errorf("key must be 16 bytes (AES-128), got %d bytes", len(key))
	}

	lines := bytes.Split(raw, []byte("\n"))
	log.Printf("Decrypting %d lines with AES-128-CBC per-line (key: %s...%s)",
		len(lines), keyHex[:4], keyHex[len(keyHex)-4:])

	var plaintext []byte
	errCount := 0
	for i, line := range lines {
		// Strip any trailing \r
		line = bytes.TrimRight(line, "\r ")
		if len(line) == 0 {
			continue
		}

		// Validate hex
		if len(line)%2 != 0 {
			log.Printf("WARNING: line %d has odd hex length %d, skipping", i+1, len(line))
			errCount++
			continue
		}

		// Hex-decode this line
		bin := make([]byte, hex.DecodedLen(len(line)))
		n, err := hex.Decode(bin, line)
		if err != nil {
			log.Printf("WARNING: line %d hex-decode failed: %v, skipping", i+1, err)
			errCount++
			continue
		}
		bin = bin[:n]

		// Decrypt this line independently
		dec, err := decryptBlock(bin, key)
		if err != nil {
			log.Printf("WARNING: line %d decrypt failed: %v, skipping", i+1, err)
			errCount++
			continue
		}

		plaintext = append(plaintext, dec...)
	}

	if errCount > 0 {
		log.Printf("WARNING: %d lines had errors during decryption", errCount)
	}
	log.Printf("Decrypted to %d bytes from %d lines", len(plaintext), len(lines))

	if err := validatePlist(plaintext); err != nil {
		return nil, fmt.Errorf("post-decryption validation failed: %w", err)
	}
	log.Printf("Decrypted data validated as XML plist")

	return plaintext, nil
}
