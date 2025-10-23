package services

import (
	"fmt"
	"os/exec"
	"runtime"
	"strings"
)

// DetectedPrinter represents a printer detected in the system
type DetectedPrinter struct {
	Name           string `json:"name"`
	Type           string `json:"type"`            // "usb", "network", "serial"
	ConnectionType string `json:"connection_type"` // "usb", "ethernet", "serial"
	Address        string `json:"address"`
	Port           int    `json:"port"`
	IsDefault      bool   `json:"is_default"`
	Status         string `json:"status"` // "online", "offline", "unknown"
	Model          string `json:"model"`
}

// DetectSystemPrinters detects printers installed on the system
func DetectSystemPrinters() ([]DetectedPrinter, error) {
	switch runtime.GOOS {
	case "windows":
		return detectWindowsPrinters()
	case "linux":
		return detectLinuxPrinters()
	case "darwin":
		return detectMacOSPrinters()
	default:
		return nil, fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// detectWindowsPrinters detects printers on Windows using WMI
func detectWindowsPrinters() ([]DetectedPrinter, error) {
	// Use PowerShell to query WMI for printers
	cmd := exec.Command("powershell", "-Command",
		`Get-Printer | Select-Object Name, DriverName, PortName, PrinterStatus, Shared, Type | ConvertTo-Json`)

	output, err := cmd.CombinedOutput()
	if err != nil {
		// Fallback: try using wmic
		return detectWindowsPrintersWMIC()
	}

	printers := parseWindowsPowerShellOutput(string(output))
	return printers, nil
}

// detectWindowsPrintersWMIC detects printers using WMIC (fallback for older Windows)
func detectWindowsPrintersWMIC() ([]DetectedPrinter, error) {
	cmd := exec.Command("wmic", "printer", "get", "Name,PortName,DriverName,Default,PrinterStatus", "/format:csv")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to detect printers: %w", err)
	}

	return parseWindowsWMICOutput(string(output)), nil
}

// parseWindowsPowerShellOutput parses PowerShell JSON output
func parseWindowsPowerShellOutput(output string) []DetectedPrinter {
	// Simple parsing - in production you'd use proper JSON unmarshaling
	var printers []DetectedPrinter

	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || line == "[" || line == "]" || line == "{" || line == "}" {
			continue
		}

		// Extract printer info from JSON fields
		printer := DetectedPrinter{
			Status: "unknown",
		}

		// Parse Name
		if strings.Contains(line, `"Name"`) {
			parts := strings.Split(line, ":")
			if len(parts) > 1 {
				name := strings.Trim(parts[1], `", `)
				printer.Name = name
			}
		}

		// Parse PortName to determine connection type
		if strings.Contains(line, `"PortName"`) {
			parts := strings.Split(line, ":")
			if len(parts) > 1 {
				portName := strings.Trim(parts[1], `", `)
				printer.Address = portName

				// Determine connection type from port name
				portUpper := strings.ToUpper(portName)
				switch {
				case strings.HasPrefix(portUpper, "COM"):
					printer.Type = "serial"
					printer.ConnectionType = "serial"
				case strings.HasPrefix(portUpper, "USB"):
					printer.Type = "usb"
					printer.ConnectionType = "usb"
				case strings.HasPrefix(portUpper, "LPT"):
					printer.Type = "serial"
					printer.ConnectionType = "parallel"
				case strings.Contains(portUpper, "IP_"):
					printer.Type = "network"
					printer.ConnectionType = "ethernet"
					printer.Port = 9100 // Default network printer port
				case strings.HasPrefix(portName, "\\\\"):
					// Windows shared printer (UNC path like \\computer\printer)
					printer.Type = "windows"
					printer.ConnectionType = "windows_share"
				default:
					printer.Type = "usb"
					printer.ConnectionType = "usb"
				}
			}
		}

		if printer.Name != "" {
			printers = append(printers, printer)
		}
	}

	// If PowerShell parsing failed, try alternative approach
	if len(printers) == 0 {
		return parseWindowsWMICOutput(output)
	}

	return printers
}

// parseWindowsWMICOutput parses WMIC CSV output
func parseWindowsWMICOutput(output string) []DetectedPrinter {
	var printers []DetectedPrinter

	lines := strings.Split(output, "\n")
	if len(lines) < 2 {
		return printers
	}

	// Skip header line
	for i := 1; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}

		fields := strings.Split(line, ",")
		if len(fields) < 4 {
			continue
		}

		// WMIC CSV format: Node,Default,DriverName,Name,PortName,PrinterStatus
		name := strings.TrimSpace(fields[3])
		portName := strings.TrimSpace(fields[4])
		isDefault := strings.TrimSpace(fields[1]) == "TRUE"

		if name == "" {
			continue
		}

		printer := DetectedPrinter{
			Name:      name,
			Address:   portName,
			IsDefault: isDefault,
			Status:    "unknown",
		}

		// Determine connection type from port name
		portUpper := strings.ToUpper(portName)
		switch {
		case strings.HasPrefix(portUpper, "COM"):
			printer.Type = "serial"
			printer.ConnectionType = "serial"
		case strings.HasPrefix(portUpper, "USB"):
			printer.Type = "usb"
			printer.ConnectionType = "usb"
		case strings.HasPrefix(portUpper, "LPT"):
			printer.Type = "serial"
			printer.ConnectionType = "parallel"
		case strings.HasPrefix(portName, "\\\\"):
			// Windows shared printer (UNC path like \\computer\printer)
			printer.Type = "windows"
			printer.ConnectionType = "windows_share"
		case strings.Contains(portUpper, "IP_") || strings.Contains(portName, "."):
			printer.Type = "network"
			printer.ConnectionType = "ethernet"
			printer.Port = 9100
			// Extract IP from port name if possible
			if strings.Contains(portName, "_") {
				parts := strings.Split(portName, "_")
				if len(parts) > 1 {
					printer.Address = parts[1]
				}
			}
		default:
			printer.Type = "usb"
			printer.ConnectionType = "usb"
		}

		printers = append(printers, printer)
	}

	return printers
}

// detectLinuxPrinters detects printers on Linux using CUPS
func detectLinuxPrinters() ([]DetectedPrinter, error) {
	cmd := exec.Command("lpstat", "-p", "-d")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to detect printers (is CUPS installed?): %w", err)
	}

	return parseLinuxCUPSOutput(string(output)), nil
}

// parseLinuxCUPSOutput parses lpstat output
func parseLinuxCUPSOutput(output string) []DetectedPrinter {
	var printers []DetectedPrinter
	var defaultPrinter string

	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)

		// Find default printer
		if strings.HasPrefix(line, "system default destination:") {
			defaultPrinter = strings.TrimSpace(strings.TrimPrefix(line, "system default destination:"))
			continue
		}

		// Parse printer lines: "printer NAME is idle. enabled since..."
		if strings.HasPrefix(line, "printer ") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				name := parts[1]
				printer := DetectedPrinter{
					Name:           name,
					Type:           "usb",
					ConnectionType: "usb",
					Address:        "/dev/usb/lp0", // Default USB printer device
					IsDefault:      name == defaultPrinter,
					Status:         "unknown",
				}

				// Determine status
				if strings.Contains(line, "idle") {
					printer.Status = "online"
				} else if strings.Contains(line, "disabled") {
					printer.Status = "offline"
				}

				printers = append(printers, printer)
			}
		}
	}

	return printers
}

// detectMacOSPrinters detects printers on macOS using CUPS
func detectMacOSPrinters() ([]DetectedPrinter, error) {
	cmd := exec.Command("lpstat", "-p", "-d")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to detect printers: %w", err)
	}

	return parseLinuxCUPSOutput(string(output)), nil
}

// DetectSerialPorts detects available serial/USB ports for thermal printers
func DetectSerialPorts() ([]string, error) {
	switch runtime.GOOS {
	case "windows":
		return detectWindowsSerialPorts()
	case "linux":
		return detectLinuxSerialPorts()
	case "darwin":
		return detectMacOSSerialPorts()
	default:
		return nil, fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// detectWindowsSerialPorts detects serial ports on Windows
func detectWindowsSerialPorts() ([]string, error) {
	var ports []string

	// Check COM1 to COM256
	for i := 1; i <= 256; i++ {
		portName := fmt.Sprintf("COM%d", i)
		cmd := exec.Command("powershell", "-Command",
			fmt.Sprintf(`[System.IO.Ports.SerialPort]::GetPortNames() | Where-Object { $_ -eq '%s' }`, portName))
		output, err := cmd.CombinedOutput()
		if err == nil && strings.TrimSpace(string(output)) != "" {
			ports = append(ports, portName)
		}
	}

	// If no ports found with PowerShell, try mode command
	if len(ports) == 0 {
		cmd := exec.Command("powershell", "-Command", `[System.IO.Ports.SerialPort]::GetPortNames()`)
		output, err := cmd.CombinedOutput()
		if err == nil {
			lines := strings.Split(string(output), "\n")
			for _, line := range lines {
				line = strings.TrimSpace(line)
				if strings.HasPrefix(line, "COM") {
					ports = append(ports, line)
				}
			}
		}
	}

	return ports, nil
}

// detectLinuxSerialPorts detects serial ports on Linux
func detectLinuxSerialPorts() ([]string, error) {
	var ports []string

	// Common serial device patterns
	patterns := []string{"/dev/ttyUSB*", "/dev/ttyACM*", "/dev/ttyS*"}

	for _, pattern := range patterns {
		cmd := exec.Command("sh", "-c", fmt.Sprintf("ls %s 2>/dev/null", pattern))
		output, err := cmd.CombinedOutput()
		if err == nil && len(output) > 0 {
			lines := strings.Split(strings.TrimSpace(string(output)), "\n")
			ports = append(ports, lines...)
		}
	}

	return ports, nil
}

// detectMacOSSerialPorts detects serial ports on macOS
func detectMacOSSerialPorts() ([]string, error) {
	var ports []string

	cmd := exec.Command("sh", "-c", "ls /dev/tty.* /dev/cu.* 2>/dev/null")
	output, err := cmd.CombinedOutput()
	if err == nil && len(output) > 0 {
		lines := strings.Split(strings.TrimSpace(string(output)), "\n")
		// Filter USB and serial devices
		for _, line := range lines {
			if strings.Contains(line, "usb") || strings.Contains(line, "serial") ||
				strings.Contains(line, "USB") || strings.Contains(line, "Serial") {
				ports = append(ports, line)
			}
		}
	}

	return ports, nil
}
