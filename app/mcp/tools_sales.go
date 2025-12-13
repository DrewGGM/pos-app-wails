package mcp

import (
	"fmt"
)

// getSalesTools returns tool definitions for sales operations
func getSalesTools() []map[string]interface{} {
	return []map[string]interface{}{
		{
			"name":        "create_sale",
			"description": "Create a new sale WITHOUT electronic invoice (venta simple sin factura). Use payment_method_id: 1=Efectivo, 2=Tarjeta, 3=Transferencia.",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"items": map[string]interface{}{
						"type":        "array",
						"description": "List of items to sell",
						"items": map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"product_id": map[string]interface{}{
									"type":        "integer",
									"description": "Product ID",
								},
								"quantity": map[string]interface{}{
									"type":        "integer",
									"description": "Quantity to sell (default: 1)",
								},
								"price": map[string]interface{}{
									"type":        "number",
									"description": "Unit price (optional, uses product price if not specified)",
								},
							},
							"required": []string{"product_id"},
						},
					},
					"payment_method_id": map[string]interface{}{
						"type":        "integer",
						"description": "Payment method: 1=Efectivo, 2=Tarjeta, 3=Transferencia (default: 1)",
					},
					"customer_id": map[string]interface{}{
						"type":        "integer",
						"description": "Customer ID (optional)",
					},
					"discount": map[string]interface{}{
						"type":        "number",
						"description": "Discount amount or percentage",
					},
					"discount_type": map[string]interface{}{
						"type":        "string",
						"description": "Type of discount: 'amount' or 'percentage'",
						"enum":        []string{"amount", "percentage"},
					},
					"notes": map[string]interface{}{
						"type":        "string",
						"description": "Additional notes for the sale",
					},
				},
				"required": []string{"items"},
			},
		},
		{
			"name":        "create_electronic_invoice",
			"description": "Create a sale WITH electronic invoice (factura electronica DIAN) for a SPECIFIC CUSTOMER. The customer must have complete tax information (NIT/CC, address, email).",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"items": map[string]interface{}{
						"type":        "array",
						"description": "List of items to sell",
						"items": map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"product_id": map[string]interface{}{
									"type":        "integer",
									"description": "Product ID",
								},
								"quantity": map[string]interface{}{
									"type":        "integer",
									"description": "Quantity to sell (default: 1)",
								},
								"price": map[string]interface{}{
									"type":        "number",
									"description": "Unit price (optional)",
								},
							},
							"required": []string{"product_id"},
						},
					},
					"payment_method_id": map[string]interface{}{
						"type":        "integer",
						"description": "Payment method: 1=Efectivo, 2=Tarjeta, 3=Transferencia (default: 1)",
					},
					"customer_id": map[string]interface{}{
						"type":        "integer",
						"description": "Customer ID (REQUIRED - must have complete tax info)",
					},
					"discount": map[string]interface{}{
						"type":        "number",
						"description": "Discount amount or percentage",
					},
					"discount_type": map[string]interface{}{
						"type":        "string",
						"description": "Type of discount: 'amount' or 'percentage'",
						"enum":        []string{"amount", "percentage"},
					},
					"send_email": map[string]interface{}{
						"type":        "boolean",
						"description": "Send invoice to customer email (default: true)",
					},
				},
				"required": []string{"items", "customer_id"},
			},
		},
		{
			"name":        "create_electronic_invoice_consumidor_final",
			"description": "Create a sale WITH electronic invoice (factura electronica DIAN) for CONSUMIDOR FINAL (generic customer). Use this when no specific customer is needed but electronic invoice is required.",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"items": map[string]interface{}{
						"type":        "array",
						"description": "List of items to sell",
						"items": map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"product_id": map[string]interface{}{
									"type":        "integer",
									"description": "Product ID",
								},
								"quantity": map[string]interface{}{
									"type":        "integer",
									"description": "Quantity to sell (default: 1)",
								},
								"price": map[string]interface{}{
									"type":        "number",
									"description": "Unit price (optional)",
								},
							},
							"required": []string{"product_id"},
						},
					},
					"payment_method_id": map[string]interface{}{
						"type":        "integer",
						"description": "Payment method: 1=Efectivo, 2=Tarjeta, 3=Transferencia (default: 1)",
					},
					"discount": map[string]interface{}{
						"type":        "number",
						"description": "Discount amount or percentage",
					},
					"discount_type": map[string]interface{}{
						"type":        "string",
						"description": "Type of discount: 'amount' or 'percentage'",
						"enum":        []string{"amount", "percentage"},
					},
				},
				"required": []string{"items"},
			},
		},
		{
			"name":        "get_sale",
			"description": "Get detailed information about a specific sale including items, payment, and invoice details",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"sale_id": map[string]interface{}{
						"type":        "integer",
						"description": "The unique ID of the sale",
					},
				},
				"required": []string{"sale_id"},
			},
		},
		{
			"name":        "list_sales",
			"description": "List sales within a date range",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"from_date": map[string]interface{}{
						"type":        "string",
						"description": "Start date (YYYY-MM-DD format)",
					},
					"to_date": map[string]interface{}{
						"type":        "string",
						"description": "End date (YYYY-MM-DD format)",
					},
					"limit": map[string]interface{}{
						"type":        "integer",
						"description": "Maximum number of sales to return",
					},
					"offset": map[string]interface{}{
						"type":        "integer",
						"description": "Number of sales to skip",
					},
				},
				"required": []string{"from_date", "to_date"},
			},
		},
		{
			"name":        "get_today_sales",
			"description": "Get all sales from today with summary totals",
			"inputSchema": map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			},
		},
		{
			"name":        "refund_sale",
			"description": "Process a refund for a sale. Creates a credit note for electronic invoices.",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"sale_id": map[string]interface{}{
						"type":        "integer",
						"description": "The unique ID of the sale to refund",
					},
					"reason": map[string]interface{}{
						"type":        "string",
						"description": "Reason for the refund",
					},
				},
				"required": []string{"sale_id", "reason"},
			},
		},
	}
}

// executeSalesTool executes a sales-related tool
func executeSalesTool(svc SalesServiceInterface, name string, args map[string]interface{}) (interface{}, error) {
	if svc == nil {
		return nil, fmt.Errorf("sales service not available")
	}

	switch name {
	case "create_sale":
		// Set invoice type to "none" for simple sales without electronic invoice
		args["invoice_type"] = "none"
		return svc.ProcessSale(args)

	case "create_electronic_invoice":
		// Set invoice type to "electronic" for DIAN invoice with specific customer
		args["invoice_type"] = "electronic"
		args["send_email"] = true // Default to sending email
		return svc.ProcessSale(args)

	case "create_electronic_invoice_consumidor_final":
		// Set invoice type to "electronic" for DIAN invoice with CONSUMIDOR FINAL
		// Don't set customer_id - the ProcessSale will use CONSUMIDOR FINAL automatically
		args["invoice_type"] = "electronic"
		return svc.ProcessSale(args)

	case "get_sale":
		saleID, ok := args["sale_id"].(float64)
		if !ok {
			return nil, fmt.Errorf("sale_id is required")
		}
		return svc.GetSale(uint(saleID))

	case "list_sales":
		fromDate, _ := args["from_date"].(string)
		toDate, _ := args["to_date"].(string)
		if fromDate == "" || toDate == "" {
			return nil, fmt.Errorf("from_date and to_date are required")
		}
		return svc.GetSalesByDateRange(fromDate, toDate)

	case "get_today_sales":
		return svc.GetTodaySales()

	case "refund_sale":
		saleID, ok := args["sale_id"].(float64)
		if !ok {
			return nil, fmt.Errorf("sale_id is required")
		}
		reason, _ := args["reason"].(string)
		err := svc.RefundSale(uint(saleID), reason)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{
			"success": true,
			"message": "Sale refunded successfully",
		}, nil

	default:
		return nil, fmt.Errorf("unknown sales tool: %s", name)
	}
}
