package com.drewcore.waiter_app.ui.screens

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material3.*
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.drewcore.waiter_app.data.models.Product
import com.drewcore.waiter_app.data.models.Modifier as ProductModifier

@Composable
fun ProductsScreen(
    products: List<Product>,
    categories: List<String>,
    selectedCategory: String?,
    onCategorySelected: (String?) -> Unit,
    onAddToCart: (Product, List<ProductModifier>, String) -> Unit,
    gridColumns: Int = 2
) {
    var showModifierDialog by remember { mutableStateOf(false) }
    var selectedProduct by remember { mutableStateOf<Product?>(null) }
    var selectedModifiers by remember { mutableStateOf<List<ProductModifier>>(emptyList()) }
    var productNotes by remember { mutableStateOf("") }

    Column(modifier = Modifier.fillMaxSize()) {
        // Category filter
        if (categories.isNotEmpty()) {
            CategoryFilter(
                categories = categories,
                selectedCategory = selectedCategory,
                onCategorySelected = onCategorySelected
            )
        }

        // Products list
        val filteredProducts = if (selectedCategory != null) {
            products.filter { it.category == selectedCategory }
        } else {
            products
        }

        if (filteredProducts.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "No hay productos disponibles",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(gridColumns),
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(filteredProducts, key = { it.id }) { product ->
                    ProductCard(
                        product = product,
                        onClick = {
                            // Check if product has modifiers
                            if (!product.modifiers.isNullOrEmpty()) {
                                selectedProduct = product
                                selectedModifiers = emptyList()
                                productNotes = ""
                                showModifierDialog = true
                            } else {
                                onAddToCart(product, emptyList(), "")
                            }
                        }
                    )
                }
            }
        }
    }

    // Modifier dialog
    if (showModifierDialog && selectedProduct != null) {
        ModifierDialog(
            product = selectedProduct!!,
            selectedModifiers = selectedModifiers,
            notes = productNotes,
            onModifiersChanged = { selectedModifiers = it },
            onNotesChanged = { productNotes = it },
            onDismiss = {
                showModifierDialog = false
                selectedProduct = null
                selectedModifiers = emptyList()
                productNotes = ""
            },
            onConfirm = {
                // Add product with selected modifiers and notes
                onAddToCart(selectedProduct!!, selectedModifiers, productNotes)
                showModifierDialog = false
                selectedProduct = null
                selectedModifiers = emptyList()
                productNotes = ""
            }
        )
    }
}

@Composable
fun CategoryFilter(
    categories: List<String>,
    selectedCategory: String?,
    onCategorySelected: (String?) -> Unit
) {
    LazyRow(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // "All" chip
        item {
            FilterChip(
                selected = selectedCategory == null,
                onClick = { onCategorySelected(null) },
                label = { Text("Todos") }
            )
        }

        // Category chips
        items(categories) { category ->
            FilterChip(
                selected = selectedCategory == category,
                onClick = { onCategorySelected(category) },
                label = { Text(category) }
            )
        }
    }
}

@Composable
fun ProductCard(
    product: Product,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(0.75f)
            .clickable { onClick() },
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Product image
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                if (!product.imageUrl.isNullOrBlank()) {
                    // Decode Base64 image asynchronously (lazy loading)
                    var bitmap by remember { mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null) }
                    var isLoading by remember { mutableStateOf(true) }
                    var hasFailed by remember { mutableStateOf(false) }

                    LaunchedEffect(product.imageUrl) {
                        isLoading = true
                        hasFailed = false
                        bitmap = withContext(Dispatchers.IO) {
                            try {
                                // Remove data URI prefix if present
                                val base64String = if (product.imageUrl.contains("base64,")) {
                                    product.imageUrl.substringAfter("base64,")
                                } else {
                                    product.imageUrl
                                }

                                // Decode Base64 to byte array
                                val decodedBytes = Base64.decode(base64String, Base64.DEFAULT)

                                // Convert to bitmap
                                val bmp = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)
                                bmp?.asImageBitmap()
                            } catch (e: Exception) {
                                android.util.Log.e("ProductsScreen", "Failed to decode Base64 image for ${product.name}", e)
                                null
                            }
                        }
                        isLoading = false
                        if (bitmap == null) {
                            hasFailed = true
                        }
                    }

                    when {
                        bitmap != null -> {
                            // Show image when loaded
                            Image(
                                bitmap = bitmap!!,
                                contentDescription = product.name,
                                modifier = Modifier.fillMaxSize(),
                                contentScale = ContentScale.Crop
                            )
                        }
                        isLoading -> {
                            // Show loading indicator while decoding
                            Surface(
                                modifier = Modifier.fillMaxSize(),
                                color = MaterialTheme.colorScheme.surfaceVariant
                            ) {
                                Box(
                                    modifier = Modifier.fillMaxSize(),
                                    contentAlignment = Alignment.Center
                                ) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(24.dp),
                                        strokeWidth = 2.dp
                                    )
                                }
                            }
                        }
                        else -> {
                            // Show placeholder if decoding failed or no image
                            Surface(
                                modifier = Modifier.fillMaxSize(),
                                color = MaterialTheme.colorScheme.surfaceVariant
                            ) {
                                Box(
                                    modifier = Modifier.fillMaxSize(),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Restaurant,
                                        contentDescription = null,
                                        modifier = Modifier.size(48.dp),
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }
                } else {
                    android.util.Log.d("ProductsScreen", "No image URL for ${product.name}, showing placeholder")
                    // Placeholder icon if no image
                    Surface(
                        modifier = Modifier.fillMaxSize(),
                        color = MaterialTheme.colorScheme.surfaceVariant
                    ) {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Restaurant,
                                contentDescription = null,
                                modifier = Modifier.size(48.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                // Stock indicator overlay
                if (product.stock < 10 && product.stock > 0) {
                    Surface(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(4.dp),
                        color = Color(0xFFFF6F00),
                        shape = MaterialTheme.shapes.small
                    ) {
                        Text(
                            text = "Stock: ${product.stock}",
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelSmall,
                            color = Color.White,
                            fontSize = 10.sp
                        )
                    }
                }
            }

            // Product info
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp)
            ) {
                Text(
                    text = product.name,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    fontSize = 14.sp
                )

                Spacer(modifier = Modifier.height(4.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "$${String.format("%.2f", product.price)}",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp
                    )

                    // Add icon indicator
                    Surface(
                        color = MaterialTheme.colorScheme.primary,
                        shape = MaterialTheme.shapes.small
                    ) {
                        Icon(
                            imageVector = Icons.Default.Add,
                            contentDescription = "Agregar",
                            modifier = Modifier
                                .padding(4.dp)
                                .size(16.dp),
                            tint = Color.White
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun ModifierDialog(
    product: Product,
    selectedModifiers: List<ProductModifier>,
    notes: String,
    onModifiersChanged: (List<ProductModifier>) -> Unit,
    onNotesChanged: (String) -> Unit,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = product.name,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp)
            ) {
                // Modifiers section
                if (!product.modifiers.isNullOrEmpty()) {
                    Text(
                        text = "Modificadores:",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )

                    product.modifiers.forEach { modifier ->
                        val isSelected = selectedModifiers.any { it.id == modifier.id }
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    val newModifiers = if (isSelected) {
                                        selectedModifiers.filter { it.id != modifier.id }
                                    } else {
                                        selectedModifiers + modifier
                                    }
                                    onModifiersChanged(newModifiers)
                                }
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Checkbox(
                                checked = isSelected,
                                onCheckedChange = null
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = modifier.name,
                                modifier = Modifier.weight(1f)
                            )
                            if (modifier.priceChange != 0.0) {
                                Text(
                                    text = "${if (modifier.priceChange > 0) "+" else ""}$${String.format("%.2f", modifier.priceChange)}",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = if (modifier.priceChange > 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))
                }

                // Notes section
                Text(
                    text = "Notas:",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(bottom = 8.dp)
                )

                TextField(
                    value = notes,
                    onValueChange = onNotesChanged,
                    placeholder = { Text("Ej: Sin cebolla, término medio...") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                    maxLines = 4
                )

                // Price summary
                val totalModifierPrice = selectedModifiers.sumOf { it.priceChange }
                if (totalModifierPrice != 0.0) {
                    Spacer(modifier = Modifier.height(16.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "Precio base:",
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Text(
                            text = "$${String.format("%.2f", product.price)}",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "Modificadores:",
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Text(
                            text = "${if (totalModifierPrice > 0) "+" else ""}$${String.format("%.2f", totalModifierPrice)}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = if (totalModifierPrice > 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                        )
                    }
                    Divider(modifier = Modifier.padding(vertical = 4.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "Total:",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "$${String.format("%.2f", product.price + totalModifierPrice)}",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = onConfirm) {
                Text("Agregar al carrito")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancelar")
            }
        }
    )
}
