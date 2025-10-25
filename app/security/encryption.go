package security

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

const keyFileName = "key.bin"

// GetKeyPath returns the path to the encryption key file
func GetKeyPath() (string, error) {
	// Get user's AppData directory
	appData := os.Getenv("APPDATA")
	if appData == "" {
		// Fallback to user's home directory
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("could not determine home directory: %w", err)
		}
		appData = filepath.Join(homeDir, "AppData", "Roaming")
	}

	// Create PosApp directory if it doesn't exist
	securityDir := filepath.Join(appData, "PosApp")
	if err := os.MkdirAll(securityDir, 0755); err != nil {
		return "", fmt.Errorf("could not create security directory: %w", err)
	}

	return filepath.Join(securityDir, keyFileName), nil
}

// GenerateKeyIfNotExists generates a new encryption key if it doesn't exist
// Returns the key (existing or newly generated)
func GenerateKeyIfNotExists() ([]byte, error) {
	keyPath, err := GetKeyPath()
	if err != nil {
		return nil, err
	}

	// Check if key already exists
	if _, err := os.Stat(keyPath); err == nil {
		// Key exists, read it
		key, err := os.ReadFile(keyPath)
		if err != nil {
			return nil, fmt.Errorf("could not read key file: %w", err)
		}
		if len(key) != 32 {
			return nil, fmt.Errorf("invalid key size: expected 32 bytes, got %d", len(key))
		}
		return key, nil
	}

	// Key doesn't exist, generate new one
	key := make([]byte, 32) // 32 bytes = 256 bits for AES-256
	_, err = rand.Read(key)
	if err != nil {
		return nil, fmt.Errorf("could not generate random key: %w", err)
	}

	// Save key with restrictive permissions (only readable by owner)
	if err := os.WriteFile(keyPath, key, 0600); err != nil {
		return nil, fmt.Errorf("could not write key file: %w", err)
	}

	return key, nil
}

// Encrypt encrypts plaintext using AES-GCM with the application key
func Encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}

	// Get or generate encryption key
	key, err := GenerateKeyIfNotExists()
	if err != nil {
		return "", err
	}

	// Create AES cipher
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("could not create cipher: %w", err)
	}

	// Create GCM mode
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("could not create GCM: %w", err)
	}

	// Generate nonce
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("could not generate nonce: %w", err)
	}

	// Encrypt
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)

	// Encode to base64 for JSON storage
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts ciphertext using AES-GCM with the application key
func Decrypt(ciphertext string) (string, error) {
	if ciphertext == "" {
		return "", nil
	}

	// Get encryption key
	key, err := GenerateKeyIfNotExists()
	if err != nil {
		return "", err
	}

	// Decode from base64
	data, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return "", fmt.Errorf("could not decode ciphertext: %w", err)
	}

	// Create AES cipher
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("could not create cipher: %w", err)
	}

	// Create GCM mode
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("could not create GCM: %w", err)
	}

	// Extract nonce
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}

	nonce, cipherData := data[:nonceSize], data[nonceSize:]

	// Decrypt
	plaintext, err := gcm.Open(nil, nonce, cipherData, nil)
	if err != nil {
		return "", fmt.Errorf("could not decrypt: %w", err)
	}

	return string(plaintext), nil
}

// EncryptIfNeeded encrypts a value only if it's not already encrypted
// Useful for migrating from plaintext to encrypted values
func EncryptIfNeeded(value string) (string, error) {
	if value == "" {
		return "", nil
	}

	// Try to decrypt - if it fails, it's probably plaintext
	_, err := Decrypt(value)
	if err != nil {
		// Not encrypted, encrypt it
		return Encrypt(value)
	}

	// Already encrypted
	return value, nil
}
