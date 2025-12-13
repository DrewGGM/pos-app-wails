package mcp

import (
	"fmt"
)

// getIngredientTools returns tool definitions for ingredient operations
func getIngredientTools() []map[string]interface{} {
	return []map[string]interface{}{
		{
			"name":        "list_ingredients",
			"description": "List all ingredients with their current stock levels",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"low_stock_only": map[string]interface{}{
						"type":        "boolean",
						"description": "If true, only return ingredients with stock at or below minimum level",
					},
				},
			},
		},
		{
			"name":        "get_ingredient",
			"description": "Get detailed information about a specific ingredient",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"ingredient_id": map[string]interface{}{
						"type":        "integer",
						"description": "The unique ID of the ingredient",
					},
				},
				"required": []string{"ingredient_id"},
			},
		},
		{
			"name":        "create_ingredient",
			"description": "Create a new ingredient for recipes",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"name": map[string]interface{}{
						"type":        "string",
						"description": "Ingredient name",
					},
					"unit": map[string]interface{}{
						"type":        "string",
						"description": "Unit of measurement",
						"enum":        []string{"unidades", "kg", "gramos", "litros", "ml"},
					},
					"stock": map[string]interface{}{
						"type":        "number",
						"description": "Initial stock quantity",
					},
					"min_stock": map[string]interface{}{
						"type":        "number",
						"description": "Minimum stock level for alerts",
					},
					"cost": map[string]interface{}{
						"type":        "number",
						"description": "Cost per unit",
					},
				},
				"required": []string{"name", "unit"},
			},
		},
		{
			"name":        "update_ingredient",
			"description": "Update an existing ingredient's information",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"ingredient_id": map[string]interface{}{
						"type":        "integer",
						"description": "The unique ID of the ingredient to update",
					},
					"name": map[string]interface{}{
						"type":        "string",
						"description": "Ingredient name",
					},
					"unit": map[string]interface{}{
						"type":        "string",
						"description": "Unit of measurement",
					},
					"min_stock": map[string]interface{}{
						"type":        "number",
						"description": "Minimum stock level",
					},
					"cost": map[string]interface{}{
						"type":        "number",
						"description": "Cost per unit",
					},
				},
				"required": []string{"ingredient_id"},
			},
		},
		{
			"name":        "adjust_ingredient_stock",
			"description": "Adjust the stock level of an ingredient",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"ingredient_id": map[string]interface{}{
						"type":        "integer",
						"description": "The unique ID of the ingredient",
					},
					"quantity": map[string]interface{}{
						"type":        "number",
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
				"required": []string{"ingredient_id", "quantity", "reason"},
			},
		},
		{
			"name":        "get_product_recipe",
			"description": "Get the recipe (list of ingredients) for a specific product",
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
	}
}

// executeIngredientTool executes an ingredient-related tool
func executeIngredientTool(svc IngredientServiceInterface, name string, args map[string]interface{}) (interface{}, error) {
	if svc == nil {
		return nil, fmt.Errorf("ingredient service not available")
	}

	switch name {
	case "list_ingredients":
		lowStockOnly := false
		if val, ok := args["low_stock_only"].(bool); ok {
			lowStockOnly = val
		}
		if lowStockOnly {
			return svc.GetLowStockIngredients()
		}
		return svc.GetAllIngredients()

	case "get_ingredient":
		ingredientID, ok := args["ingredient_id"].(float64)
		if !ok {
			return nil, fmt.Errorf("ingredient_id is required")
		}
		return svc.GetIngredient(uint(ingredientID))

	case "create_ingredient":
		return svc.CreateIngredient(args)

	case "update_ingredient":
		ingredientID, ok := args["ingredient_id"].(float64)
		if !ok {
			return nil, fmt.Errorf("ingredient_id is required")
		}
		delete(args, "ingredient_id")
		return svc.UpdateIngredient(uint(ingredientID), args)

	case "adjust_ingredient_stock":
		ingredientID, ok := args["ingredient_id"].(float64)
		if !ok {
			return nil, fmt.Errorf("ingredient_id is required")
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

		err := svc.AdjustIngredientStock(uint(ingredientID), quantity, reason, movementType)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{
			"success": true,
			"message": fmt.Sprintf("Ingredient stock adjusted by %.2f", quantity),
		}, nil

	case "get_product_recipe":
		productID, ok := args["product_id"].(float64)
		if !ok {
			return nil, fmt.Errorf("product_id is required")
		}
		return svc.GetProductIngredients(uint(productID))

	default:
		return nil, fmt.Errorf("unknown ingredient tool: %s", name)
	}
}
