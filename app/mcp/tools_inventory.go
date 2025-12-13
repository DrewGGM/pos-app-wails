package mcp

import (
	"fmt"
)

// getInventoryTools returns tool definitions for inventory operations
func getInventoryTools() []map[string]interface{} {
	return []map[string]interface{}{
		{
			"name":        "get_inventory_status",
			"description": "Get the current inventory status for all products, optionally filtered to show only low stock items",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"low_stock_only": map[string]interface{}{
						"type":        "boolean",
						"description": "If true, only return products with stock at or below minimum level",
					},
				},
			},
		},
		{
			"name":        "adjust_stock",
			"description": "Adjust the stock level of a product. Use positive quantity to add stock, negative to remove, or 'set' type to set absolute value.",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"product_id": map[string]interface{}{
						"type":        "integer",
						"description": "The unique ID of the product",
					},
					"quantity": map[string]interface{}{
						"type":        "integer",
						"description": "Quantity to adjust (positive to add, negative to remove)",
					},
					"reason": map[string]interface{}{
						"type":        "string",
						"description": "Reason for the stock adjustment",
					},
					"type": map[string]interface{}{
						"type":        "string",
						"description": "Type of adjustment: 'add', 'remove', or 'set'",
						"enum":        []string{"add", "remove", "set"},
					},
				},
				"required": []string{"product_id", "quantity", "reason"},
			},
		},
		{
			"name":        "get_stock_movements",
			"description": "Get the history of stock movements for a specific product",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"product_id": map[string]interface{}{
						"type":        "integer",
						"description": "The unique ID of the product",
					},
					"from_date": map[string]interface{}{
						"type":        "string",
						"description": "Start date for filtering (YYYY-MM-DD format)",
					},
					"to_date": map[string]interface{}{
						"type":        "string",
						"description": "End date for filtering (YYYY-MM-DD format)",
					},
				},
				"required": []string{"product_id"},
			},
		},
		{
			"name":        "get_low_stock_alerts",
			"description": "Get all products that have stock at or below their minimum stock level",
			"inputSchema": map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			},
		},
	}
}

// executeInventoryTool executes an inventory-related tool
func executeInventoryTool(svc ProductServiceInterface, name string, args map[string]interface{}) (interface{}, error) {
	if svc == nil {
		return nil, fmt.Errorf("product service not available")
	}

	switch name {
	case "get_inventory_status":
		lowStockOnly := false
		if val, ok := args["low_stock_only"].(bool); ok {
			lowStockOnly = val
		}
		if lowStockOnly {
			return svc.GetLowStockProducts()
		}
		return svc.GetAllProducts()

	case "adjust_stock":
		productID, ok := args["product_id"].(float64)
		if !ok {
			return nil, fmt.Errorf("product_id is required")
		}
		quantity, ok := args["quantity"].(float64)
		if !ok {
			return nil, fmt.Errorf("quantity is required")
		}
		reason, _ := args["reason"].(string)
		movementType := "add"
		if t, ok := args["type"].(string); ok {
			movementType = t
		}

		err := svc.AdjustStock(uint(productID), int(quantity), reason, movementType)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{
			"success": true,
			"message": fmt.Sprintf("Stock adjusted by %d for product %d", int(quantity), int(productID)),
		}, nil

	case "get_stock_movements":
		productID, ok := args["product_id"].(float64)
		if !ok {
			return nil, fmt.Errorf("product_id is required")
		}
		return svc.GetInventoryMovements(uint(productID))

	case "get_low_stock_alerts":
		return svc.GetLowStockProducts()

	default:
		return nil, fmt.Errorf("unknown inventory tool: %s", name)
	}
}
