package services

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"io/ioutil"
	"net"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"PosApp/app/database"
	"PosApp/app/models"

	"github.com/skip2/go-qrcode"
	"gorm.io/gorm"
)

// ESC/POS Commands
const (
	ESC byte = 0x1B
	GS  byte = 0x1D
	DLE byte = 0x10
	EOT byte = 0x04
	ENQ byte = 0x05
	SP  byte = 0x20
	NL  byte = 0x0A
	FF  byte = 0x0C
)

// PrinterService handles thermal printer operations
type PrinterService struct {
	db                 *gorm.DB
	connection         io.WriteCloser
	buffer             *bytes.Buffer
	windowsPrinterName string                 // For Windows shared printers
	printerType        string                 // "usb", "network", "serial", "file", "windows"
	currentConfig      *models.PrinterConfig  // Current printer configuration
}

// NewPrinterService creates a new printer service
func NewPrinterService() *PrinterService {
	return &PrinterService{
		db:     database.GetDB(),
		buffer: new(bytes.Buffer),
	}
}

// ESC/POS helper methods
func (s *PrinterService) init() {
	s.buffer.Write([]byte{ESC, '@'}) // Initialize printer
	s.setCodePage()                  // Set character encoding for Spanish/Latin
}

func (s *PrinterService) setCodePage() {
	// Set Code Page to 850 (Multilingual Latin 1) for Spanish characters
	// ESC t n where n=2 is CP850 (supports á é í ó ú ñ etc.)
	s.buffer.Write([]byte{ESC, 't', 2})
}

// removeDiacritics removes accents and special characters from text
// This is a fallback for printers that don't support extended character sets
func removeDiacritics(text string) string {
	// Map accented characters to their base ASCII equivalents
	replacements := map[rune]rune{
		'á': 'a', 'Á': 'A',
		'é': 'e', 'É': 'E',
		'í': 'i', 'Í': 'I',
		'ó': 'o', 'Ó': 'O',
		'ú': 'u', 'Ú': 'U',
		'ü': 'u', 'Ü': 'U',
		'ñ': 'n', 'Ñ': 'N',
		'¿': '?', '¡': '!',
		'º': 'o', 'ª': 'a',
		'€': 'E',
	}

	var result []rune
	for _, r := range text {
		if r < 128 {
			// ASCII character - pass through
			result = append(result, r)
		} else if replacement, ok := replacements[r]; ok {
			// Known special character - replace with ASCII equivalent
			result = append(result, replacement)
		} else {
			// Unknown character - keep as is or replace with space
			result = append(result, ' ')
		}
	}
	return string(result)
}

func (s *PrinterService) write(text string) {
	// Remove accents and special characters for thermal printer compatibility
	// This ensures all text prints correctly even on printers with limited character support
	converted := removeDiacritics(text)
	s.buffer.WriteString(converted)
}

func (s *PrinterService) lineFeed() {
	s.buffer.WriteByte(NL)
}

func (s *PrinterService) setAlign(align string) {
	var a byte = 0
	switch align {
	case "center":
		a = 1
	case "right":
		a = 2
	}
	s.buffer.Write([]byte{ESC, 'a', a})
}

func (s *PrinterService) setEmphasize(on bool) {
	var e byte = 0
	if on {
		e = 1
	}
	s.buffer.Write([]byte{ESC, 'E', e})
}

func (s *PrinterService) setSize(width, height byte) {
	size := ((width - 1) << 4) | (height - 1)
	s.buffer.Write([]byte{GS, '!', size})
}

func (s *PrinterService) cut() {
	s.buffer.Write([]byte{GS, 'V', 66, 0})
}

func (s *PrinterService) cashDrawer() {
	s.buffer.Write([]byte{ESC, 'p', 0, 25, 250})
}

// printQRCodeAsImage generates a QR code as image and prints it as bitmap
func (s *PrinterService) printQRCodeAsImage(data string, size int) error {
	// Generate QR code as PNG image
	qr, err := qrcode.New(data, qrcode.Medium)
	if err != nil {
		return fmt.Errorf("failed to generate QR code: %w", err)
	}

	// Set size (pixels)
	qr.DisableBorder = false
	img := qr.Image(size)

	// Print as bitmap
	return s.printImage(img)
}

// printLogoFromBase64 decodes base64 logo and prints it
func (s *PrinterService) printLogoFromBase64(base64Data string) error {
	// Remove data URI prefix if present
	if idx := strings.Index(base64Data, ","); idx != -1 {
		base64Data = base64Data[idx+1:]
	}

	// Decode base64
	imgData, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return fmt.Errorf("failed to decode base64 image: %w", err)
	}

	// Decode image
	img, _, err := image.Decode(bytes.NewReader(imgData))
	if err != nil {
		return fmt.Errorf("failed to decode image: %w", err)
	}

	// Print as bitmap
	return s.printImage(img)
}

// printImage converts an image to ESC/POS bitmap and prints it
// Uses GS v 0 command which is more compatible with modern thermal printers
func (s *PrinterService) printImage(img image.Image) error {
	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()

	// Create a new image with white background to handle transparency
	// This ensures transparent areas appear white instead of black
	whiteBackground := image.NewRGBA(image.Rect(0, 0, width, height))

	// Fill with white
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			whiteBackground.Set(x, y, color.White)
		}
	}

	// Draw original image on top of white background
	// This composites transparent areas as white
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			originalColor := img.At(x, y)
			r, g, b, a := originalColor.RGBA()

			// If pixel has any transparency, blend with white background
			if a < 65535 {
				// Convert alpha to 0-255 range
				alpha := float64(a) / 65535.0

				// Blend with white background
				r = uint32(float64(r)*alpha + float64(65535)*(1-alpha))
				g = uint32(float64(g)*alpha + float64(65535)*(1-alpha))
				b = uint32(float64(b)*alpha + float64(65535)*(1-alpha))
				a = 65535 // Now fully opaque
			}

			whiteBackground.SetRGBA(x, y, color.RGBA{
				R: uint8(r >> 8),
				G: uint8(g >> 8),
				B: uint8(b >> 8),
				A: uint8(a >> 8),
			})
		}
	}

	// Use the image with white background
	img = whiteBackground
	bounds = img.Bounds()
	width = bounds.Dx()
	height = bounds.Dy()

	// Calculate max width based on paper size (assumes 203 DPI)
	// 58mm = 288px, 80mm = 384px at 203 DPI
	maxWidth := 384 // Default to 80mm
	if s.currentConfig != nil {
		if s.currentConfig.PaperWidth == 58 {
			maxWidth = 288
		} else if s.currentConfig.PaperWidth == 80 {
			maxWidth = 384
		}
	}

	// Resize if too wide for thermal printer
	if width > maxWidth {
		// Simple resize by skipping pixels
		ratio := float64(width) / float64(maxWidth)
		newHeight := int(float64(height) / ratio)
		resized := image.NewRGBA(image.Rect(0, 0, maxWidth, newHeight))

		for y := 0; y < newHeight; y++ {
			for x := 0; x < maxWidth; x++ {
				srcX := int(float64(x) * ratio)
				srcY := int(float64(y) * ratio)
				resized.Set(x, y, img.At(srcX, srcY))
			}
		}

		img = resized
		bounds = img.Bounds()
		width = bounds.Dx()
		height = bounds.Dy()
	}

	// Convert to monochrome bitmap
	// ESC/POS uses 8 pixels per byte (1 bit per pixel)
	widthBytes := (width + 7) / 8

	// Center image
	s.lineFeed()

	// Use GS v 0 command for raster bitmap printing
	// GS v 0 m xL xH yL yH d1...dk
	// m = 0 (normal mode)
	// xL, xH = width in bytes (little endian)
	// yL, yH = height in dots (little endian)
	s.buffer.WriteByte(GS)                     // 0x1D
	s.buffer.WriteByte('v')                    // 0x76
	s.buffer.WriteByte('0')                    // 0x30
	s.buffer.WriteByte(0)                      // m = 0 (normal)
	s.buffer.WriteByte(byte(widthBytes % 256)) // xL
	s.buffer.WriteByte(byte(widthBytes / 256)) // xH
	s.buffer.WriteByte(byte(height % 256))     // yL
	s.buffer.WriteByte(byte(height / 256))     // yH

	// Write bitmap data row by row
	for y := 0; y < height; y++ {
		for x := 0; x < width; x += 8 {
			var b byte = 0
			for bit := 0; bit < 8; bit++ {
				px := x + bit
				if px < width {
					// Get pixel color (now all pixels are opaque with white background)
					r, g, b2, _ := img.At(px, y).RGBA()

					// RGBA() returns values in range 0-65535
					// Convert to 0-255 range
					r8 := uint8(r >> 8)
					g8 := uint8(g >> 8)
					b8 := uint8(b2 >> 8)

					// Convert RGB to grayscale using standard luminance formula
					// Y = 0.299*R + 0.587*G + 0.114*B
					gray := uint8((299*uint32(r8) + 587*uint32(g8) + 114*uint32(b8)) / 1000)

					// If pixel is dark (below threshold), print it
					// Use threshold of 128 (0=black, 255=white)
					// In ESC/POS: bit=1 means print black, bit=0 means leave white
					if gray < 128 {
						b |= (1 << uint(7-bit))
					}
				}
			}
			s.buffer.WriteByte(b)
		}
	}

	s.lineFeed()
	s.lineFeed()

	return nil
}

func (s *PrinterService) print() error {
	// Handle Windows printers differently
	if s.printerType == "windows" {
		return s.printToWindowsPrinter()
	}

	// For other types, write directly to connection
	if s.connection == nil {
		return fmt.Errorf("no printer connection")
	}
	_, err := s.connection.Write(s.buffer.Bytes())
	s.buffer.Reset()
	return err
}

// printToWindowsPrinter sends RAW data to a Windows printer using PowerShell and .NET API
func (s *PrinterService) printToWindowsPrinter() error {
	if s.windowsPrinterName == "" {
		return fmt.Errorf("no Windows printer name specified")
	}

	// Create a temporary file with the print data
	tmpFile, err := ioutil.TempFile("", "posprint_*.prn")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	tmpFilePath := tmpFile.Name()
	defer os.Remove(tmpFilePath) // Clean up

	// Write the ESC/POS commands to the temp file
	if _, err := tmpFile.Write(s.buffer.Bytes()); err != nil {
		tmpFile.Close()
		return fmt.Errorf("failed to write to temp file: %w", err)
	}
	tmpFile.Close()

	// Clear buffer
	s.buffer.Reset()

	// Use PowerShell with .NET PrintDocument API to send RAW data
	// This is the proper way to send ESC/POS commands to Windows printers
	psScript := fmt.Sprintf(`
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$printerName = '%s'
$filePath = '%s'

# Read the file content as bytes
$bytes = [System.IO.File]::ReadAllBytes($filePath)

# Create a PrintDocument
$printDoc = New-Object System.Drawing.Printing.PrintDocument
$printDoc.PrinterSettings.PrinterName = $printerName

# Set to print RAW data
$printDoc.PrinterSettings.PrintFileName = $filePath

# Variable to hold print data
$script:printData = $bytes

# Add print page event handler
$printPageHandler = {
    param($sender, $ev)
    # For RAW printing, we don't use graphics
    # Just signal that we're done
    $ev.HasMorePages = $false
}

$printDoc.add_PrintPage($printPageHandler)

# Alternatively, use RawPrinterHelper approach with P/Invoke
$code = @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DOCINFO {
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pDataType;
    }

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int Level, ref DOCINFO pDocInfo);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendBytesToPrinter(string printerName, byte[] bytes) {
        IntPtr hPrinter = IntPtr.Zero;
        DOCINFO di = new DOCINFO();
        di.pDocName = "RAW Document";
        di.pDataType = "RAW";

        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
            return false;
        }

        if (!StartDocPrinter(hPrinter, 1, ref di)) {
            ClosePrinter(hPrinter);
            return false;
        }

        if (!StartPagePrinter(hPrinter)) {
            EndDocPrinter(hPrinter);
            ClosePrinter(hPrinter);
            return false;
        }

        IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
        int dwWritten = 0;
        bool success = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);
        Marshal.FreeCoTaskMem(pUnmanagedBytes);

        EndPagePrinter(hPrinter);
        EndDocPrinter(hPrinter);
        ClosePrinter(hPrinter);

        return success;
    }
}
"@

Add-Type -TypeDefinition $code -Language CSharp

# Send the raw bytes to the printer
$result = [RawPrinterHelper]::SendBytesToPrinter($printerName, $bytes)

if (-not $result) {
    throw "Failed to send data to printer"
}

Write-Output "Print job sent successfully"
`, s.windowsPrinterName, tmpFilePath)

	cmd := exec.Command("powershell", "-Command", psScript)
	output, err := cmd.CombinedOutput()

	if err != nil {
		return fmt.Errorf("failed to send to Windows printer '%s': %v - %s", s.windowsPrinterName, err, string(output))
	}

	return nil
}

// PrintReceipt prints a receipt for a sale using the default printer
func (s *PrinterService) PrintReceipt(sale *models.Sale, isElectronicInvoice bool) error {
	return s.PrintReceiptWithPrinter(sale, isElectronicInvoice, 0)
}

// PrintReceiptWithPrinter prints a receipt to a specific printer (0 = default)
func (s *PrinterService) PrintReceiptWithPrinter(sale *models.Sale, isElectronicInvoice bool, printerID uint) error {
	// Get printer config
	var config *models.PrinterConfig
	var err error

	if printerID > 0 {
		// Get specific printer
		var printerConfig models.PrinterConfig
		if err := s.db.First(&printerConfig, printerID).Error; err != nil {
			return fmt.Errorf("printer not found: %w", err)
		}
		config = &printerConfig
	} else {
		// Get default printer
		config, err = s.getDefaultPrinterConfig()
		if err != nil {
			return fmt.Errorf("no default printer configured: %w", err)
		}
	}

	// Connect to printer
	if err := s.connectPrinter(config); err != nil {
		return fmt.Errorf("failed to connect to printer: %w", err)
	}
	defer s.closePrinter()

	// Print receipt based on type
	if isElectronicInvoice && sale.ElectronicInvoice != nil {
		return s.printElectronicInvoice(sale, config)
	}
	return s.printSimpleReceipt(sale, config)
}

// printElectronicInvoice prints an electronic invoice with DIAN requirements
func (s *PrinterService) printElectronicInvoice(sale *models.Sale, config *models.PrinterConfig) error {
	// Initialize printer
	s.init()
	s.setAlign("center")

	// Get restaurant config
	var restaurant models.RestaurantConfig
	s.db.First(&restaurant)

	// Get DIAN config
	var dianConfig models.DIANConfig
	s.db.First(&dianConfig)

	// Print logo if available
	if restaurant.Logo != "" {
		s.lineFeed()
		if err := s.printLogoFromBase64(restaurant.Logo); err != nil {
			// If logo fails, just continue without it
			s.write("[LOGO]\n")
		}
		s.lineFeed()
	}

	// Print header - FACTURA ELECTRÓNICA DE VENTA
	s.setEmphasize(true)
	s.setSize(2, 2)
	s.write("FACTURA ELECTRÓNICA DE VENTA\n")
	s.setSize(1, 1)
	s.setEmphasize(false)
	s.lineFeed()

	// Print company info
	s.setEmphasize(true)
	s.write(fmt.Sprintf("%s\n", restaurant.Name))
	s.setEmphasize(false)
	s.write(fmt.Sprintf("NIT: %s-%s\n", dianConfig.IdentificationNumber, dianConfig.DV))
	s.write(fmt.Sprintf("%s\n", restaurant.Address))
	s.write(fmt.Sprintf("Tel: %s\n", restaurant.Phone))
	s.write(fmt.Sprintf("Email: %s\n", restaurant.Email))

	// Regime and liability info
	parametricData := models.GetDIANParametricData()
	if regime, ok := parametricData.TypeRegimes[dianConfig.TypeRegimeID]; ok {
		s.write(fmt.Sprintf("Régimen: %s\n", regime.Name))
	}
	if liability, ok := parametricData.TypeLiabilities[dianConfig.TypeLiabilityID]; ok {
		s.write(fmt.Sprintf("Responsabilidad: %s\n", liability.Name))
	}

	s.lineFeed()
	s.setAlign("left")

	// Print invoice number and dates
	s.write(s.printSeparator())
	s.setEmphasize(true)
	s.write(fmt.Sprintf("Factura: %s%s\n",
		sale.ElectronicInvoice.Prefix,
		sale.ElectronicInvoice.InvoiceNumber))
	s.setEmphasize(false)
	s.write(fmt.Sprintf("Fecha: %s\n", sale.CreatedAt.Format("2006-01-02 15:04:05")))

	// Print customer info
	s.write(s.printSeparator())
	s.setEmphasize(true)
	s.write("DATOS DEL CLIENTE\n")
	s.setEmphasize(false)
	if sale.Customer != nil {
		s.write(fmt.Sprintf("Nombre: %s\n", sale.Customer.Name))
		s.write(fmt.Sprintf("NIT/CC: %s", sale.Customer.IdentificationNumber))
		if sale.Customer.DV != nil {
			s.write(fmt.Sprintf("-%s", *sale.Customer.DV))
		}
		s.write("\n")
		if sale.Customer.Address != "" {
			s.write(fmt.Sprintf("Dirección: %s\n", sale.Customer.Address))
		}
		if sale.Customer.Phone != "" {
			s.write(fmt.Sprintf("Teléfono: %s\n", sale.Customer.Phone))
		}
	} else {
		s.write("CONSUMIDOR FINAL\n")
	}

	// Print items
	s.write(s.printSeparator())
	s.setEmphasize(true)
	s.write("DETALLE DE PRODUCTOS/SERVICIOS\n")
	s.setEmphasize(false)
	s.write(s.printSeparator())

	// Load order items
	s.db.Preload("Order.Items.Product").First(sale, sale.ID)

	for _, item := range sale.Order.Items {
		// Item description and quantity
		s.write(fmt.Sprintf("%s\n", item.Product.Name))
		s.write(fmt.Sprintf("  %d x $%s = $%s\n",
			item.Quantity,
			s.formatMoney(item.UnitPrice),
			s.formatMoney(item.Subtotal)))

		// Item notes if any
		if item.Notes != "" {
			s.write(fmt.Sprintf("  Nota: %s\n", item.Notes))
		}
	}

	// Print totals
	s.write(s.printSeparator())
	s.setAlign("right")
	s.write(fmt.Sprintf("Subtotal: $%s\n", s.formatMoney(sale.Subtotal)))
	if sale.Discount > 0 {
		s.write(fmt.Sprintf("Descuento: -$%s\n", s.formatMoney(sale.Discount)))
	}
	// Only show IVA if company is VAT responsible (tax > 0)
	if sale.Tax > 0 {
		s.write(fmt.Sprintf("IVA: $%s\n", s.formatMoney(sale.Tax)))
	}
	s.setEmphasize(true)
	s.setSize(1, 2)
	s.write(fmt.Sprintf("TOTAL: $%s\n", s.formatMoney(sale.Total)))
	s.setSize(1, 1)
	s.setEmphasize(false)
	s.setAlign("left")

	// Print payment method
	s.write(s.printSeparator())
	s.write("FORMA DE PAGO\n")
	s.db.Preload("PaymentDetails.PaymentMethod").First(sale, sale.ID)
	for _, payment := range sale.PaymentDetails {
		s.write(fmt.Sprintf("%s: $%s\n",
			payment.PaymentMethod.Name,
			s.formatMoney(payment.Amount)))
		if payment.Reference != "" {
			s.write(fmt.Sprintf("  Ref: %s\n", payment.Reference))
		}
	}

	// Print footer
	s.lineFeed()
	s.setAlign("center")
	s.write("*** REPRESENTACIÓN IMPRESA DE LA ***\n")
	s.write("*** FACTURA ELECTRÓNICA DE VENTA ***\n")
	s.lineFeed()
	s.write("Validar en:\n")
	s.write("https://catalogo-vpfe.dian.gov.co\n")

	// Print QR Code as image
	s.lineFeed()
	qrURL := fmt.Sprintf("https://catalogo-vpfe.dian.gov.co/Document/FindDocument?documentKey=%s", sale.ElectronicInvoice.CUFE)
	s.setAlign("center")
	if err := s.printQRCodeAsImage(qrURL, 256); err != nil {
		// If QR fails, show placeholder
		s.write("[ CÓDIGO QR - ERROR ]\n")
		s.write("(Error al generar QR)\n")
	}
	s.lineFeed()
	s.lineFeed()

	// Print CUFE text below QR
	s.setAlign("center")
	s.setEmphasize(true)
	s.write("CUFE:\n")
	s.setEmphasize(false)
	s.setAlign("left")
	s.write(s.wrapText(sale.ElectronicInvoice.CUFE, 48))
	s.lineFeed()

	// Employee info
	s.lineFeed()
	s.write(s.printSeparator())
	s.setAlign("left")
	s.db.Preload("Employee").First(sale, sale.ID)
	s.write(fmt.Sprintf("Atendió: %s\n", sale.Employee.Name))
	s.write(fmt.Sprintf("Caja: %d\n", sale.CashRegisterID))

	// Final message
	s.lineFeed()
	s.setAlign("center")
	s.write("¡Gracias por su compra!\n")
	if restaurant.Website != "" {
		s.write(restaurant.Website + "\n")
	}

	// Cut paper if enabled
	if config.AutoCut {
		s.cut()
	} else {
		s.lineFeed()
		s.lineFeed()
		s.lineFeed()
	}

	// Open cash drawer if configured
	if config.CashDrawer {
		s.cashDrawer()
	}

	return s.print()
}

// printSimpleReceipt prints a simple receipt (non-electronic invoice)
func (s *PrinterService) printSimpleReceipt(sale *models.Sale, config *models.PrinterConfig) error {
	// Initialize printer
	s.init()
	s.setAlign("center")

	// Get restaurant config
	var restaurant models.RestaurantConfig
	s.db.First(&restaurant)

	// Print logo if available
	if restaurant.Logo != "" {
		s.lineFeed()
		if err := s.printLogoFromBase64(restaurant.Logo); err != nil {
			// If logo fails, just continue without it
			s.write("[LOGO]\n")
		}
		s.lineFeed()
	}

	// Print header
	s.setEmphasize(true)
	s.setSize(2, 2)
	s.write(fmt.Sprintf("%s\n", restaurant.Name))
	s.setSize(1, 1)
	s.setEmphasize(false)
	s.write(fmt.Sprintf("%s\n", restaurant.Address))
	s.write(fmt.Sprintf("Tel: %s\n", restaurant.Phone))
	s.lineFeed()

	// Print receipt number and date
	s.setAlign("left")
	s.write(s.printSeparator())
	s.write(fmt.Sprintf("Recibo: %s\n", sale.SaleNumber))
	s.write(fmt.Sprintf("Fecha: %s\n", sale.CreatedAt.Format("2006-01-02 15:04:05")))

	// Print customer if available
	if sale.Customer != nil {
		s.write(fmt.Sprintf("Cliente: %s\n", sale.Customer.Name))
	}

	// Print items
	s.write(s.printSeparator())
	s.db.Preload("Order.Items.Product").First(sale, sale.ID)

	for _, item := range sale.Order.Items {
		s.write(fmt.Sprintf("%d x %s\n", item.Quantity, item.Product.Name))
		s.write(fmt.Sprintf("  $%s c/u = $%s\n",
			s.formatMoney(item.UnitPrice),
			s.formatMoney(item.Subtotal)))
	}

	// Print totals
	s.write(s.printSeparator())
	s.write(fmt.Sprintf("Subtotal: $%s\n", s.formatMoney(sale.Subtotal)))
	if sale.Discount > 0 {
		s.write(fmt.Sprintf("Descuento: -$%s\n", s.formatMoney(sale.Discount)))
	}
	// Only show IVA if company is VAT responsible (tax > 0)
	if sale.Tax > 0 {
		s.write(fmt.Sprintf("IVA: $%s\n", s.formatMoney(sale.Tax)))
	}
	s.setEmphasize(true)
	s.write(fmt.Sprintf("TOTAL: $%s\n", s.formatMoney(sale.Total)))
	s.setEmphasize(false)

	// Payment info
	s.write(s.printSeparator())
	s.db.Preload("PaymentDetails.PaymentMethod").First(sale, sale.ID)
	for _, payment := range sale.PaymentDetails {
		s.write(fmt.Sprintf("%s: $%s\n",
			payment.PaymentMethod.Name,
			s.formatMoney(payment.Amount)))
	}

	// Footer
	s.lineFeed()
	s.setAlign("center")
	s.write("¡Gracias por su compra!\n")

	// Cut and open drawer
	if config.AutoCut {
		s.cut()
	} else {
		s.lineFeed()
		s.lineFeed()
		s.lineFeed()
	}

	if config.CashDrawer {
		s.cashDrawer()
	}

	return s.print()
}

// PrintKitchenOrder prints a kitchen order ticket
func (s *PrinterService) PrintKitchenOrder(order *models.Order) error {
	// Get kitchen printer
	config, err := s.getKitchenPrinterConfig()
	if err != nil {
		return fmt.Errorf("no kitchen printer configured: %w", err)
	}

	// Connect to printer
	if err := s.connectPrinter(config); err != nil {
		return fmt.Errorf("failed to connect to printer: %w", err)
	}
	defer s.closePrinter()

	// Initialize printer
	s.init()
	s.setAlign("center")

	// Print header
	s.setEmphasize(true)
	s.setSize(2, 2)
	s.write("ORDEN DE COCINA\n")
	s.setSize(1, 1)
	s.setEmphasize(false)
	s.lineFeed()

	// Print order info
	s.setAlign("left")
	s.write(s.printSeparator())
	s.setEmphasize(true)
	s.write(fmt.Sprintf("Orden #: %s\n", order.OrderNumber))
	s.setEmphasize(false)
	s.write(fmt.Sprintf("Fecha: %s\n", order.CreatedAt.Format("15:04:05")))

	// Print table if applicable
	if order.Table != nil {
		s.setEmphasize(true)
		s.setSize(1, 2)
		s.write(fmt.Sprintf("Mesa: %s\n", order.Table.Number))
		s.setSize(1, 1)
		s.setEmphasize(false)
	}

	// Print type
	s.write(fmt.Sprintf("Tipo: %s\n", order.Type))

	// Print items
	s.write(s.printSeparator())
	s.db.Preload("Items.Product").Preload("Items.Modifiers.Modifier").First(order, order.ID)

	for _, item := range order.Items {
		if item.Status == "pending" || item.Status == "preparing" {
			s.setEmphasize(true)
			s.write(fmt.Sprintf("%d x %s\n", item.Quantity, item.Product.Name))
			s.setEmphasize(false)

			// Print modifiers
			for _, mod := range item.Modifiers {
				s.write(fmt.Sprintf("  - %s\n", mod.Modifier.Name))
			}

			// Print notes
			if item.Notes != "" {
				s.write(fmt.Sprintf("  NOTA: %s\n", item.Notes))
			}
			s.lineFeed()
		}
	}

	// Print general notes
	if order.Notes != "" {
		s.write(s.printSeparator())
		s.setEmphasize(true)
		s.write("NOTAS:\n")
		s.setEmphasize(false)
		s.write(order.Notes + "\n")
	}

	// Footer
	s.write(s.printSeparator())
	s.setAlign("center")
	s.write(fmt.Sprintf("Hora: %s\n", time.Now().Format("15:04:05")))

	// Cut paper
	if config.AutoCut {
		s.cut()
	} else {
		s.lineFeed()
		s.lineFeed()
		s.lineFeed()
	}

	return s.print()
}

// PrintOrder prints an order as a simple receipt (with prices and totals)
func (s *PrinterService) PrintOrder(order *models.Order) error {
	// Get default printer
	config, err := s.getDefaultPrinterConfig()
	if err != nil {
		return fmt.Errorf("no default printer configured: %w", err)
	}

	// Connect to printer
	if err := s.connectPrinter(config); err != nil {
		return fmt.Errorf("failed to connect to printer: %w", err)
	}
	defer s.closePrinter()

	// Initialize printer
	s.init()
	s.setAlign("center")

	// Get restaurant config
	var restaurant models.RestaurantConfig
	s.db.First(&restaurant)

	// Print logo if available
	if restaurant.Logo != "" {
		s.lineFeed()
		if err := s.printLogoFromBase64(restaurant.Logo); err != nil {
			// If logo fails, just continue without it
			s.write("[LOGO]\n")
		}
		s.lineFeed()
	}

	// Print header
	s.setEmphasize(true)
	s.setSize(2, 2)
	s.write(fmt.Sprintf("%s\n", restaurant.Name))
	s.setSize(1, 1)
	s.setEmphasize(false)
	s.write(fmt.Sprintf("%s\n", restaurant.Address))
	s.write(fmt.Sprintf("Tel: %s\n", restaurant.Phone))
	s.lineFeed()

	// Print order info
	s.setAlign("left")
	s.write(s.printSeparator())
	s.setEmphasize(true)
	s.write(fmt.Sprintf("Orden #: %s\n", order.OrderNumber))
	s.setEmphasize(false)
	s.write(fmt.Sprintf("Fecha: %s\n", order.CreatedAt.Format("2006-01-02 15:04:05")))

	// Print table if applicable
	if order.Table != nil {
		s.write(fmt.Sprintf("Mesa: %s\n", order.Table.Number))
	}

	// Print takeout number if applicable
	if order.TakeoutNumber != nil {
		s.write(fmt.Sprintf("Para Llevar #: %d\n", *order.TakeoutNumber))
	}

	// Print customer if available
	if order.Customer != nil {
		s.write(fmt.Sprintf("Cliente: %s\n", order.Customer.Name))
	}

	// Print items
	s.write(s.printSeparator())
	s.db.Preload("Items.Product").Preload("Items.Modifiers.Modifier").First(order, order.ID)

	for _, item := range order.Items {
		s.write(fmt.Sprintf("%d x %s\n", item.Quantity, item.Product.Name))

		// Print modifiers
		modifiersTotal := 0.0
		for _, mod := range item.Modifiers {
			s.write(fmt.Sprintf("  + %s", mod.Modifier.Name))
			if mod.PriceChange != 0 {
				s.write(fmt.Sprintf(" ($%s)", s.formatMoney(mod.PriceChange)))
				modifiersTotal += mod.PriceChange
			}
			s.write("\n")
		}

		// Print unit price and subtotal
		unitPriceWithModifiers := item.UnitPrice + modifiersTotal
		s.write(fmt.Sprintf("  $%s c/u = $%s\n",
			s.formatMoney(unitPriceWithModifiers),
			s.formatMoney(item.Subtotal)))

		// Print notes if any
		if item.Notes != "" {
			s.write(fmt.Sprintf("  Nota: %s\n", item.Notes))
		}
	}

	// Print totals
	s.write(s.printSeparator())
	s.setAlign("right")
	s.write(fmt.Sprintf("Subtotal: $%s\n", s.formatMoney(order.Subtotal)))
	if order.Discount > 0 {
		s.write(fmt.Sprintf("Descuento: -$%s\n", s.formatMoney(order.Discount)))
	}
	// Only show IVA if there is tax
	if order.Tax > 0 {
		s.write(fmt.Sprintf("IVA: $%s\n", s.formatMoney(order.Tax)))
	}
	s.setEmphasize(true)
	s.setSize(1, 2)
	s.write(fmt.Sprintf("TOTAL: $%s\n", s.formatMoney(order.Total)))
	s.setSize(1, 1)
	s.setEmphasize(false)
	s.setAlign("left")

	// Print general notes if any
	if order.Notes != "" {
		s.write(s.printSeparator())
		s.write("Notas:\n")
		s.write(order.Notes + "\n")
	}

	// Print employee if available
	if order.Employee != nil {
		s.lineFeed()
		s.write(s.printSeparator())
		s.write(fmt.Sprintf("Atendió: %s\n", order.Employee.Name))
	}

	// Footer
	s.lineFeed()
	s.setAlign("center")
	s.write("¡Gracias por su preferencia!\n")
	if restaurant.Website != "" {
		s.write(restaurant.Website + "\n")
	}

	// Cut paper if enabled
	if config.AutoCut {
		s.cut()
	} else {
		s.lineFeed()
		s.lineFeed()
		s.lineFeed()
	}

	return s.print()
}

// PrintCashRegisterReport prints cash register report
func (s *PrinterService) PrintCashRegisterReport(report *models.CashRegisterReport) error {
	config, err := s.getDefaultPrinterConfig()
	if err != nil {
		return err
	}

	if err := s.connectPrinter(config); err != nil {
		return err
	}
	defer s.closePrinter()

	s.init()
	s.setAlign("center")

	// Get restaurant config for logo
	var restaurant models.RestaurantConfig
	s.db.First(&restaurant)

	// Print logo if available
	if restaurant.Logo != "" {
		s.lineFeed()
		if err := s.printLogoFromBase64(restaurant.Logo); err != nil {
			// If logo fails, just continue without it
			s.write("[LOGO]\n")
		}
		s.lineFeed()
	}

	// Header
	s.setEmphasize(true)
	s.setSize(2, 2)
	s.write("CIERRE DE CAJA\n")
	s.setSize(1, 1)
	s.setEmphasize(false)
	s.write(fmt.Sprintf("Fecha: %s\n", report.Date.Format("2006-01-02")))
	s.lineFeed()

	// Employee - Load if not already loaded
	s.setAlign("left")
	if report.Employee == nil && report.GeneratedBy > 0 {
		var employee models.Employee
		if err := s.db.First(&employee, report.GeneratedBy).Error; err == nil {
			report.Employee = &employee
		}
	}
	if report.Employee != nil {
		s.write(fmt.Sprintf("Cajero: %s\n", report.Employee.Name))
	}
	s.write(s.printSeparator())

	// Sales summary
	s.setEmphasize(true)
	s.write("RESUMEN DE VENTAS\n")
	s.setEmphasize(false)
	s.write(fmt.Sprintf("Total Ventas: %d\n", report.NumberOfSales))
	s.write(fmt.Sprintf("Total Facturado: $%s\n", s.formatMoney(report.TotalSales)))
	s.lineFeed()

	// Payment methods breakdown
	s.setEmphasize(true)
	s.write("FORMAS DE PAGO\n")
	s.setEmphasize(false)
	s.write(fmt.Sprintf("Efectivo: $%s\n", s.formatMoney(report.TotalCash)))
	s.write(fmt.Sprintf("Tarjetas: $%s\n", s.formatMoney(report.TotalCard)))
	s.write(fmt.Sprintf("Digital: $%s\n", s.formatMoney(report.TotalDigital)))
	s.write(fmt.Sprintf("Otros: $%s\n", s.formatMoney(report.TotalOther)))
	s.lineFeed()

	// Cash movements
	s.setEmphasize(true)
	s.write("MOVIMIENTOS DE EFECTIVO\n")
	s.setEmphasize(false)
	s.write(fmt.Sprintf("Base Inicial: $%s\n", s.formatMoney(report.OpeningBalance)))
	s.write(fmt.Sprintf("Ventas en Efectivo: $%s\n", s.formatMoney(report.TotalCash)))
	s.write(fmt.Sprintf("Depósitos: +$%s\n", s.formatMoney(report.CashDeposits)))
	s.write(fmt.Sprintf("Retiros: -$%s\n", s.formatMoney(report.CashWithdrawals)))
	s.write(s.printSeparator())

	// Totals
	s.setEmphasize(true)
	s.write(fmt.Sprintf("Efectivo Esperado: $%s\n", s.formatMoney(report.ExpectedBalance)))
	s.write(fmt.Sprintf("Efectivo Contado: $%s\n", s.formatMoney(report.ClosingBalance)))

	// Difference
	if report.Difference != 0 {
		if report.Difference > 0 {
			s.write(fmt.Sprintf("Sobrante: +$%s\n", s.formatMoney(report.Difference)))
		} else {
			s.write(fmt.Sprintf("Faltante: -$%s\n", s.formatMoney(-report.Difference)))
		}
	} else {
		s.write("CUADRE PERFECTO\n")
	}
	s.setEmphasize(false)

	// Notes if any
	if report.Notes != "" {
		s.lineFeed()
		s.write("Observaciones:\n")
		s.write(report.Notes + "\n")
	}

	// Footer
	s.lineFeed()
	s.write(s.printSeparator())
	s.setAlign("center")
	s.write(fmt.Sprintf("Impreso: %s\n", time.Now().Format("2006-01-02 15:04:05")))

	// Signatures
	s.lineFeed()
	s.lineFeed()
	s.write("_______________________\n")
	s.write("Firma Cajero\n")
	s.lineFeed()
	s.lineFeed()
	s.write("_______________________\n")
	s.write("Firma Supervisor\n")

	// Cut
	if config.AutoCut {
		s.cut()
	} else {
		s.lineFeed()
		s.lineFeed()
		s.lineFeed()
	}

	return s.print()
}

// Helper methods

func (s *PrinterService) connectPrinter(config *models.PrinterConfig) error {
	var err error

	// Save current config for later use (e.g., calculating image width)
	s.currentConfig = config

	// Auto-detect type if empty based on address and connection_type
	printerType := config.Type
	if printerType == "" {
		if strings.HasPrefix(config.Address, "\\\\") {
			printerType = "windows"
		} else if config.ConnectionType == "ethernet" || config.ConnectionType == "network" {
			printerType = "network"
		} else if config.ConnectionType == "serial" {
			printerType = "serial"
		} else if config.ConnectionType == "windows_share" {
			printerType = "windows"
		} else {
			printerType = "usb"
		}
	}

	s.printerType = printerType

	switch printerType {
	case "usb":
		// USB printer connection - open device file directly
		s.connection, err = os.OpenFile(config.Address, os.O_RDWR, 0)
		if err != nil {
			return fmt.Errorf("failed to open USB printer at %s: %w", config.Address, err)
		}

	case "network":
		// Network printer connection
		address := fmt.Sprintf("%s:%d", config.Address, config.Port)
		conn, err := net.Dial("tcp", address)
		if err != nil {
			return fmt.Errorf("failed to connect to network printer at %s: %w", address, err)
		}
		// Wrap the net.Conn to implement io.WriteCloser
		s.connection = conn

	case "serial":
		// Serial printer connection
		s.connection, err = os.OpenFile(config.Address, os.O_RDWR, 0)
		if err != nil {
			return fmt.Errorf("failed to open serial printer at %s: %w", config.Address, err)
		}

	case "file":
		// File output for testing
		s.connection, err = os.Create(config.Address)
		if err != nil {
			return fmt.Errorf("failed to create output file at %s: %w", config.Address, err)
		}

	case "windows":
		// Windows shared printer - extract printer name from UNC path or use directly
		printerName := config.Address

		// If it's a UNC path (\\computer\printer), we need to format it correctly
		if strings.HasPrefix(printerName, "\\\\") {
			// For Windows copy command, use the UNC path as-is
			s.windowsPrinterName = printerName
		} else {
			// For local printer names, no modification needed
			s.windowsPrinterName = printerName
		}

		// No actual connection needed - we'll use Windows spooler
		// Verify Windows OS
		if runtime.GOOS != "windows" {
			return fmt.Errorf("Windows printer type only supported on Windows OS")
		}

	default:
		return fmt.Errorf("unsupported printer type: %s", config.Type)
	}

	return err
}

func (s *PrinterService) closePrinter() {
	if s.connection != nil {
		s.connection.Close()
		s.connection = nil
	}
}

func (s *PrinterService) getDefaultPrinterConfig() (*models.PrinterConfig, error) {
	var config models.PrinterConfig
	err := s.db.Where("is_default = ? AND is_active = ?", true, true).First(&config).Error
	if err != nil {
		return nil, fmt.Errorf("no default printer configured: please configure a printer in Settings")
	}
	return &config, nil
}

func (s *PrinterService) getKitchenPrinterConfig() (*models.PrinterConfig, error) {
	// Try to get kitchen printer, fallback to default
	var config models.PrinterConfig
	err := s.db.Where("name LIKE ? AND is_active = ?", "%cocina%", true).First(&config).Error
	if err != nil {
		return s.getDefaultPrinterConfig()
	}
	return &config, nil
}

func (s *PrinterService) printSeparator() string {
	return "================================\n"
}

func (s *PrinterService) formatMoney(amount float64) string {
	// Format money without decimals for Colombian pesos
	return strings.ReplaceAll(fmt.Sprintf("%.0f", amount), ",", ".")
}

func (s *PrinterService) wrapText(text string, width int) string {
	if len(text) <= width {
		return text + "\n"
	}

	var result strings.Builder
	for i := 0; i < len(text); i += width {
		end := i + width
		if end > len(text) {
			end = len(text)
		}
		result.WriteString(text[i:end] + "\n")
	}

	return result.String()
}

// TestPrinter tests printer connection
func (s *PrinterService) TestPrinter(printerID uint) error {
	var config models.PrinterConfig
	if err := s.db.First(&config, printerID).Error; err != nil {
		// Use default config if specific printer not found
		defaultConfig, err := s.getDefaultPrinterConfig()
		if err != nil {
			return err
		}
		config = *defaultConfig
	}

	if err := s.connectPrinter(&config); err != nil {
		return err
	}
	defer s.closePrinter()

	// Get restaurant config
	var restaurant models.RestaurantConfig
	s.db.First(&restaurant)

	// Get DIAN config
	var dianConfig models.DIANConfig
	s.db.First(&dianConfig)

	// Initialize printer
	s.init()
	s.setAlign("center")

	// Print logo if available
	if restaurant.Logo != "" {
		s.lineFeed()
		if err := s.printLogoFromBase64(restaurant.Logo); err != nil {
			// If logo fails, just continue without it
			s.write("[LOGO]\n")
		}
		s.lineFeed()
	}

	// Print header - FACTURA ELECTRÓNICA DE VENTA
	s.setEmphasize(true)
	s.setSize(2, 2)
	s.write("FACTURA ELECTRÓNICA\n")
	s.write("DE VENTA\n")
	s.setSize(1, 1)
	s.setEmphasize(false)
	s.write("*** PRUEBA DE IMPRESIÓN ***\n")
	s.lineFeed()

	// Print company info
	s.setEmphasize(true)
	if restaurant.BusinessName != "" {
		s.write(fmt.Sprintf("%s\n", restaurant.BusinessName))
	} else {
		s.write(fmt.Sprintf("%s\n", restaurant.Name))
	}
	s.setEmphasize(false)

	if dianConfig.IdentificationNumber != "" {
		s.write(fmt.Sprintf("NIT: %s", dianConfig.IdentificationNumber))
		if dianConfig.DV != "" {
			s.write(fmt.Sprintf("-%s", dianConfig.DV))
		}
		s.write("\n")
	} else if restaurant.IdentificationNumber != "" {
		s.write(fmt.Sprintf("NIT: %s", restaurant.IdentificationNumber))
		if restaurant.DV != "" {
			s.write(fmt.Sprintf("-%s", restaurant.DV))
		}
		s.write("\n")
	}

	if restaurant.Address != "" {
		s.write(fmt.Sprintf("%s\n", restaurant.Address))
	}
	if restaurant.Phone != "" {
		s.write(fmt.Sprintf("Tel: %s\n", restaurant.Phone))
	}
	if restaurant.Email != "" {
		s.write(fmt.Sprintf("Email: %s\n", restaurant.Email))
	}

	// Regime and liability info
	parametricData := models.GetDIANParametricData()
	if restaurant.TypeRegimeID != nil {
		if regime, ok := parametricData.TypeRegimes[*restaurant.TypeRegimeID]; ok {
			s.write(fmt.Sprintf("Régimen: %s\n", regime.Name))
		}
	}
	if restaurant.TypeLiabilityID != nil {
		if liability, ok := parametricData.TypeLiabilities[*restaurant.TypeLiabilityID]; ok {
			s.write(fmt.Sprintf("Responsabilidad: %s\n", liability.Name))
		}
	}

	s.lineFeed()
	s.setAlign("left")

	// Print invoice number and dates
	s.write(s.printSeparator())
	s.setEmphasize(true)
	s.write("Factura: SETT-00001234\n")
	s.setEmphasize(false)
	s.write(fmt.Sprintf("Fecha: %s\n", time.Now().Format("2006-01-02 15:04:05")))

	// Print customer info
	s.write(s.printSeparator())
	s.setEmphasize(true)
	s.write("DATOS DEL CLIENTE\n")
	s.setEmphasize(false)
	s.write("Nombre: Consumidor Final\n")
	s.write("CC: 222222222222\n")

	// Print items
	s.write(s.printSeparator())
	s.setEmphasize(true)
	s.write("DETALLE DE PRODUCTOS/SERVICIOS\n")
	s.setEmphasize(false)
	s.write(s.printSeparator())

	// Sample items
	s.write("AGUA 600 ML\n")
	s.write("  2 x $2000 = $4,000\n")
	s.lineFeed()

	s.write("GASEOSA COCA-COLA 600ML\n")
	s.write("  1 x $3,500 = $3,500\n")
	s.lineFeed()

	s.write("LECHONA\n")
	s.write("  2 x $13,000 = $26,000\n")
	s.lineFeed()

	s.write("TAMAL\n")
	s.write("  1 x $12,000 = $12,000\n")
	s.lineFeed()

	// Print totals
	s.write(s.printSeparator())
	s.setAlign("right")
	s.write("Subtotal: $45,500\n")
	s.write("Descuento: -$1,000\n")
	s.write("IVA (N/A): $0,0\n")
	s.setEmphasize(true)
	s.setSize(1, 2)
	s.write("TOTAL: $44,500\n")
	s.setSize(1, 1)
	s.setEmphasize(false)
	s.setAlign("left")

	// Print tax details
	s.write(s.printSeparator())
	s.setEmphasize(true)
	s.write("DETALLES DE IMPUESTOS\n")
	s.setEmphasize(false)
	s.write("TARIFA          BASE      IMPUESTO\n")
	s.write("IVA N/A      $40,500      $0,0\n")

	// Print payment method
	s.write(s.printSeparator())
	s.write("FORMA DE PAGO\n")
	s.write("Efectivo: $50,000\n")
	s.write("Cambio: $9,500\n")

	// Print footer
	s.lineFeed()
	s.setAlign("center")
	s.write("*** REPRESENTACIÓN IMPRESA DE LA ***\n")
	s.write("*** FACTURA ELECTRÓNICA DE VENTA ***\n")
	s.lineFeed()
	s.write("Validar en:\n")
	s.write("https://catalogo-vpfe.dian.gov.co\n")

	// Print QR Code placeholder
	// Print QR Code as image
	s.lineFeed()
	cufe := "4c24513e1efb589192d917b048c80e5ca706f0f50944d1e1ced01e25ae1b5053152cb69aa1ad411f8aafe468"
	qrData := fmt.Sprintf("https://catalogo-vpfe.dian.gov.co/Document/FindDocument?documentKey=%s", cufe)
	s.setAlign("center")
	if err := s.printQRCodeAsImage(qrData, 256); err != nil {
		// If QR fails, show placeholder
		s.write("[ CÓDIGO QR - ERROR ]\n")
		s.write("(Error al generar QR)\n")
	}
	s.lineFeed()
	s.lineFeed()

	// Print CUFE text below QR
	s.setAlign("center")
	s.setEmphasize(true)
	s.write("CUFE:\n")
	s.setEmphasize(false)
	s.setAlign("left")
	s.write(s.wrapText(cufe, 48))
	s.lineFeed()

	// Employee info
	s.write(s.printSeparator())
	s.setAlign("left")
	s.write("Atendió: Usuario de Prueba\n")
	s.write("Caja: 1\n")

	// Final message
	s.lineFeed()
	s.setAlign("center")
	s.write("¡Gracias por su compra!\n")
	if restaurant.Website != "" {
		s.write(restaurant.Website + "\n")
	}
	s.lineFeed()
	s.write("=== PRUEBA DE IMPRESIÓN ===\n")
	s.write(fmt.Sprintf("Impreso: %s\n", time.Now().Format("2006-01-02 15:04:05")))

	// Cut paper if enabled
	if config.AutoCut {
		s.lineFeed()
		s.cut()
	} else {
		s.lineFeed()
		s.lineFeed()
		s.lineFeed()
	}

	return s.print()
}

// GetAvailablePrinters detects printers installed on the system
func (s *PrinterService) GetAvailablePrinters() ([]DetectedPrinter, error) {
	return DetectSystemPrinters()
}

// GetAvailableSerialPorts detects available serial/USB ports
func (s *PrinterService) GetAvailableSerialPorts() ([]string, error) {
	return DetectSerialPorts()
}
