package mcp

import (
	"fmt"
)

// getProductTools returns tool definitions for product operations
func getProductTools() []map[string]interface{} {
	return []map[string]interface{}{
		{
			"name":        "list_products",
			"description": "List all products with optional filtering by category. Returns product name, price, category, stock, and availability status.",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"category_id": map[string]interface{}{
						"type":        "integer",
						"description": "Filter by category ID (optional)",
					},
					"include_inactive": map[string]interface{}{
						"type":        "boolean",
						"description": "Include inactive products (default: false)",
					},
					"limit": map[string]interface{}{
						"type":        "integer",
						"description": "Maximum number of products to return",
					},
					"offset": map[string]interface{}{
						"type":        "integer",
						"description": "Number of products to skip (for pagination)",
					},
				},
			},
		},
		{
			"name":        "get_product",
			"description": "Get detailed information about a specific product including its modifiers, category, and stock level",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"product_id": map[string]interface{}{
						"type":        "integer",
						"description": "The unique ID of the product",
					},
				},
				"required": []string{"product_id"},
			},
		},
		{
			"name":        "create_product",
			"description": "Create a new product in the catalog",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"name": map[string]interface{}{
						"type":        "string",
						"description": "Product name",
					},
					"price": map[string]interface{}{
						"type":        "number",
						"description": "Product price",
					},
					"category_id": map[string]interface{}{
						"type":        "integer",
						"description": "Category ID for the product",
					},
					"description": map[string]interface{}{
						"type":        "string",
						"description": "Product description",
					},
					"track_inventory": map[string]interface{}{
						"type":        "boolean",
						"description": "Whether to track inventory for this product",
					},
					"stock": map[string]interface{}{
						"type":        "integer",
						"description": "Initial stock quantity",
					},
					"minimum_stock": map[string]interface{}{
						"type":        "integer",
						"description": "Minimum stock level for alerts",
					},
					"is_active": map[string]interface{}{
						"type":        "boolean",
						"description": "Whether the product is active and available for sale",
					},
				},
				"required": []string{"name", "price"},
			},
		},
		{
			"name":        "update_product",
			"description": "Update an existing product's information",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"product_id": map[string]interface{}{
						"type":        "integer",
						"description": "The unique ID of the product to update",
					},
					"name": map[string]interface{}{
						"type":        "string",
						"description": "Product name",
					},
					"price": map[string]interface{}{
						"type":        "number",
						"description": "Product price",
					},
					"category_id": map[string]interface{}{
						"type":        "integer",
						"description": "Category ID",
					},
					"description": map[string]interface{}{
						"type":        "string",
						"description": "Product description",
					},
					"is_active": map[string]interface{}{
						"type":        "boolean",
						"description": "Whether the product is active",
					},
				},
				"required": []string{"product_id"},
			},
		},
		{
			"name":        "delete_product",
			"description": "Delete a product from the catalog (soft delete)",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"product_id": map[string]interface{}{
						"type":        "integer",
						"description": "The unique ID of the product to delete",
					},
				},
				"required": []string{"product_id"},
			},
		},
		{
			"name":        "search_products",
			"description": "Search products by name or description",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"query": map[string]interface{}{
						"type":        "string",
						"description": "Search term to find in product name or description",
					},
					"category_id": map[string]interface{}{
						"type":        "integer",
						"description": "Filter by category ID (optional)",
					},
				},
				"required": []string{"query"},
			},
		},
		{
			"name":        "get_product_modifiers",
			"description": "Get all modifier groups and modifiers available for a product",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"product_id": map[string]interface{}{
						"type":        "integer",
						"description": "The unique ID of the product",
					},
				},
				"required": []string{"product_id"},
			},
		},
		{
			"name":        "list_categories",
			"description": "List all product categories",
			"inputSchema": map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			},
		},
		{
			"name":        "create_category",
			"description": "Create a new product category",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"name": map[string]interface{}{
						"type":        "string",
						"description": "Category name",
					},
					"description": map[string]interface{}{
						"type":        "string",
						"description": "Category description",
					},
					"color": map[string]interface{}{
						"type":        "string",
						"description": "Category color (hex format, e.g., #FF5733)",
					},
				},
				"required": []string{"name"},
			},
		},
	}
}

// executeProductTool executes a product-related tool
func executeProductTool(svc ProductServiceInterface, name string, args map[string]interface{}) (interface{}, error) {
	if svc == nil {
		return nil, fmt.Errorf("product service not available")
	}

	switch name {
	case "list_products":
		return svc.GetAllProducts()

	case "get_product":
		productID, ok := args["product_id"].(float64)
		if !ok {
			return nil, fmt.Errorf("product_id is required")
		}
		return svc.GetProduct(uint(productID))

	case "create_product":
		return svc.CreateProduct(args)

	case "update_product":
		productID, ok := args["product_id"].(float64)
		if !ok {
			return nil, fmt.Errorf("product_id is required")
		}
		delete(args, "product_id")
		return svc.UpdateProduct(uint(productID), args)

	case "delete_product":
		productID, ok := args["product_id"].(float64)
		if !ok {
			return nil, fmt.Errorf("product_id is required")
		}
		err := svc.DeleteProduct(uint(productID))
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "message": "Product deleted"}, nil

	case "search_products":
		query, ok := args["query"].(string)
		if !ok {
			return nil, fmt.Errorf("query is required")
		}
		var categoryID *uint
		if catID, ok := args["category_id"].(float64); ok {
			id := uint(catID)
			categoryID = &id
		}
		return svc.SearchProducts(query, categoryID)

	case "get_product_modifiers":
		productID, ok := args["product_id"].(float64)
		if !ok {
			return nil, fmt.Errorf("product_id is required")
		}
		return svc.GetModifierGroupsForProduct(uint(productID))

	case "list_categories":
		return svc.GetAllCategories()

	case "create_category":
		return svc.CreateCategory(args)

	default:
		return nil, fmt.Errorf("unknown product tool: %s", name)
	}
}
