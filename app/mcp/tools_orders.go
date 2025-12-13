package mcp

import (
	"fmt"
)

// getOrderTools returns tool definitions for order operations
func getOrderTools() []map[string]interface{} {
	return []map[string]interface{}{
		{
			"name":        "create_order",
			"description": "Create a new order. Orders can be for tables, takeout, or delivery.",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"order_type_id": map[string]interface{}{
						"type":        "integer",
						"description": "Order type ID (1=Dine-in, 2=Takeout, 3=Delivery, etc.)",
					},
					"table_id": map[string]interface{}{
						"type":        "integer",
						"description": "Table ID (for dine-in orders)",
					},
					"customer_name": map[string]interface{}{
						"type":        "string",
						"description": "Customer name (for takeout/delivery)",
					},
					"customer_phone": map[string]interface{}{
						"type":        "string",
						"description": "Customer phone (for delivery)",
					},
					"delivery_address": map[string]interface{}{
						"type":        "string",
						"description": "Delivery address",
					},
					"items": map[string]interface{}{
						"type":        "array",
						"description": "List of items to add to the order",
						"items": map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"product_id": map[string]interface{}{
									"type":        "integer",
									"description": "Product ID",
								},
								"quantity": map[string]interface{}{
									"type":        "integer",
									"description": "Quantity",
								},
								"notes": map[string]interface{}{
									"type":        "string",
									"description": "Special instructions",
								},
								"modifiers": map[string]interface{}{
									"type":        "array",
									"description": "List of modifier IDs",
									"items": map[string]interface{}{
										"type": "integer",
									},
								},
							},
							"required": []string{"product_id", "quantity"},
						},
					},
					"notes": map[string]interface{}{
						"type":        "string",
						"description": "Order notes",
					},
				},
				"required": []string{"order_type_id", "items"},
			},
		},
		{
			"name":        "get_order",
			"description": "Get detailed information about a specific order including items, status, and totals",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"order_id": map[string]interface{}{
						"type":        "integer",
						"description": "The unique ID of the order",
					},
				},
				"required": []string{"order_id"},
			},
		},
		{
			"name":        "update_order_status",
			"description": "Update the status of an order",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"order_id": map[string]interface{}{
						"type":        "integer",
						"description": "The unique ID of the order",
					},
					"status": map[string]interface{}{
						"type":        "string",
						"description": "New status for the order",
						"enum":        []string{"pending", "in_progress", "ready", "delivered", "completed", "cancelled"},
					},
				},
				"required": []string{"order_id", "status"},
			},
		},
		{
			"name":        "add_items_to_order",
			"description": "Add additional items to an existing order",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"order_id": map[string]interface{}{
						"type":        "integer",
						"description": "The unique ID of the order",
					},
					"items": map[string]interface{}{
						"type":        "array",
						"description": "List of items to add",
						"items": map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"product_id": map[string]interface{}{
									"type":        "integer",
									"description": "Product ID",
								},
								"quantity": map[string]interface{}{
									"type":        "integer",
									"description": "Quantity",
								},
								"notes": map[string]interface{}{
									"type":        "string",
									"description": "Special instructions",
								},
							},
							"required": []string{"product_id", "quantity"},
						},
					},
				},
				"required": []string{"order_id", "items"},
			},
		},
		{
			"name":        "remove_item_from_order",
			"description": "Remove an item from an order",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"order_id": map[string]interface{}{
						"type":        "integer",
						"description": "The unique ID of the order",
					},
					"item_id": map[string]interface{}{
						"type":        "integer",
						"description": "The unique ID of the order item to remove",
					},
				},
				"required": []string{"order_id", "item_id"},
			},
		},
		{
			"name":        "list_orders",
			"description": "List orders with optional filtering by status or date range",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"status": map[string]interface{}{
						"type":        "string",
						"description": "Filter by status",
						"enum":        []string{"pending", "in_progress", "ready", "delivered", "completed", "cancelled"},
					},
					"table_id": map[string]interface{}{
						"type":        "integer",
						"description": "Filter by table ID",
					},
					"from_date": map[string]interface{}{
						"type":        "string",
						"description": "Start date (YYYY-MM-DD format)",
					},
					"to_date": map[string]interface{}{
						"type":        "string",
						"description": "End date (YYYY-MM-DD format)",
					},
				},
			},
		},
		{
			"name":        "send_to_kitchen",
			"description": "Send an order to the kitchen for preparation",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"order_id": map[string]interface{}{
						"type":        "integer",
						"description": "The unique ID of the order",
					},
				},
				"required": []string{"order_id"},
			},
		},
		{
			"name":        "mark_order_ready",
			"description": "Mark an order as ready for pickup or delivery",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"order_id": map[string]interface{}{
						"type":        "integer",
						"description": "The unique ID of the order",
					},
				},
				"required": []string{"order_id"},
			},
		},
		{
			"name":        "get_pending_orders",
			"description": "Get all orders that are pending or in progress",
			"inputSchema": map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			},
		},
	}
}

// executeOrderTool executes an order-related tool
func executeOrderTool(svc OrderServiceInterface, name string, args map[string]interface{}) (interface{}, error) {
	if svc == nil {
		return nil, fmt.Errorf("order service not available")
	}

	switch name {
	case "create_order":
		return svc.CreateOrder(args)

	case "get_order":
		orderID, ok := args["order_id"].(float64)
		if !ok {
			return nil, fmt.Errorf("order_id is required")
		}
		return svc.GetOrder(uint(orderID))

	case "update_order_status":
		orderID, ok := args["order_id"].(float64)
		if !ok {
			return nil, fmt.Errorf("order_id is required")
		}
		status, ok := args["status"].(string)
		if !ok {
			return nil, fmt.Errorf("status is required")
		}
		err := svc.UpdateOrderStatus(uint(orderID), status)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{
			"success": true,
			"message": fmt.Sprintf("Order %d status updated to %s", int(orderID), status),
		}, nil

	case "add_items_to_order":
		orderID, ok := args["order_id"].(float64)
		if !ok {
			return nil, fmt.Errorf("order_id is required")
		}
		items, ok := args["items"].([]interface{})
		if !ok {
			return nil, fmt.Errorf("items is required")
		}
		// Convert items to []map[string]interface{}
		itemMaps := make([]map[string]interface{}, len(items))
		for i, item := range items {
			if m, ok := item.(map[string]interface{}); ok {
				itemMaps[i] = m
			}
		}
		err := svc.AddItemsToOrder(uint(orderID), itemMaps)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{
			"success": true,
			"message": "Items added to order",
		}, nil

	case "remove_item_from_order":
		orderID, ok := args["order_id"].(float64)
		if !ok {
			return nil, fmt.Errorf("order_id is required")
		}
		itemID, ok := args["item_id"].(float64)
		if !ok {
			return nil, fmt.Errorf("item_id is required")
		}
		err := svc.RemoveItemFromOrder(uint(orderID), uint(itemID))
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{
			"success": true,
			"message": "Item removed from order",
		}, nil

	case "list_orders":
		if status, ok := args["status"].(string); ok && status != "" {
			return svc.GetOrdersByStatus(status)
		}
		fromDate, _ := args["from_date"].(string)
		toDate, _ := args["to_date"].(string)
		if fromDate != "" && toDate != "" {
			return svc.GetOrdersByDateRange(fromDate, toDate)
		}
		// Default: get pending orders
		return svc.GetOrdersByStatus("pending")

	case "send_to_kitchen":
		orderID, ok := args["order_id"].(float64)
		if !ok {
			return nil, fmt.Errorf("order_id is required")
		}
		err := svc.SendOrderToKitchen(uint(orderID))
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{
			"success": true,
			"message": "Order sent to kitchen",
		}, nil

	case "mark_order_ready":
		orderID, ok := args["order_id"].(float64)
		if !ok {
			return nil, fmt.Errorf("order_id is required")
		}
		err := svc.MarkOrderReady(uint(orderID))
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{
			"success": true,
			"message": "Order marked as ready",
		}, nil

	case "get_pending_orders":
		return svc.GetOrdersByStatus("pending")

	default:
		return nil, fmt.Errorf("unknown order tool: %s", name)
	}
}
