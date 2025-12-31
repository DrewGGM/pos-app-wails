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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage
import coil.request.ImageRequest
import com.drewcore.waiter_app.data.models.Product
import com.drewcore.waiter_app.data.models.Modifier as ProductModifier

@Composable
fun ProductsScreen(
    products: List<Product>,
    categories: List<String>,
    selectedCategory: String?,
    customPages: List<com.drewcore.waiter_app.data.models.CustomPage>,
    selectedCustomPage: com.drewcore.waiter_app.data.models.CustomPage?,
    customPageProducts: List<Product>,
    onCategorySelected: (String?) -> Unit,
    onCustomPageSelected: (com.drewcore.waiter_app.data.models.CustomPage?) -> Unit,
    onAddToCart: (Product, List<ProductModifier>, String, Double?) -> Unit,
    gridColumns: Int = 2
) {
    var showModifierDialog by remember { mutableStateOf(false) }
    var showPriceDialog by remember { mutableStateOf(false) }
    var selectedProduct by remember { mutableStateOf<Product?>(null) }
    var selectedModifiers by remember { mutableStateOf<List<ProductModifier>>(emptyList()) }
    var productNotes by remember { mutableStateOf("") }
    var customPrice by remember { mutableStateOf<Double?>(null) }

    Column(modifier = Modifier.fillMaxSize()) {
        // Custom pages and category filter
        if (customPages.isNotEmpty() || categories.isNotEmpty()) {
            ProductFilter(
                customPages = customPages,
                selectedCustomPage = selectedCustomPage,
                categories = categories,
                selectedCategory = selectedCategory,
                onCustomPageSelected = onCustomPageSelected,
                onCategorySelected = onCategorySelected
            )
        }

        // Products list - use custom page products if selected, otherwise use category filter
        val filteredProducts = when {
            selectedCustomPage != null -> customPageProducts
            selectedCategory != null -> products.filter { it.category == selectedCategory }
            else -> products
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
                            selectedProduct = product
                            selectedModifiers = emptyList()
                            productNotes = ""
                            customPrice = null

                            // Check if product has variable price
                            if (product.hasVariablePrice) {
                                showPriceDialog = true
                            }
                            // Check if product has modifiers
                            else if (!product.modifiers.isNullOrEmpty()) {
                                showModifierDialog = true
                            } else {
                                onAddToCart(product, emptyList(), "", null)
                            }
                        }
                    )
                }
            }
        }
    }

    // Price dialog for variable price products
    if (showPriceDialog && selectedProduct != null) {
        VariablePriceDialog(
            product = selectedProduct!!,
            onDismiss = {
                showPriceDialog = false
                selectedProduct = null
                customPrice = null
            },
            onConfirm = { price ->
                customPrice = price
                showPriceDialog = false
                // After getting price, check if product has modifiers
                if (!selectedProduct!!.modifiers.isNullOrEmpty()) {
                    showModifierDialog = true
                } else {
                    onAddToCart(selectedProduct!!, emptyList(), "", customPrice)
                    selectedProduct = null
                    customPrice = null
                }
            }
        )
    }

    // Modifier dialog
    if (showModifierDialog && selectedProduct != null) {
        ModifierDialog(
            product = selectedProduct!!,
            selectedModifiers = selectedModifiers,
            notes = productNotes,
            customPrice = customPrice,
            onModifiersChanged = { selectedModifiers = it },
            onNotesChanged = { productNotes = it },
            onDismiss = {
                showModifierDialog = false
                selectedProduct = null
                selectedModifiers = emptyList()
                productNotes = ""
                customPrice = null
            },
            onConfirm = {
                // Add product with selected modifiers and notes
                onAddToCart(selectedProduct!!, selectedModifiers, productNotes, customPrice)
                showModifierDialog = false
                selectedProduct = null
                selectedModifiers = emptyList()
                productNotes = ""
                customPrice = null
            }
        )
    }
}

@Composable
fun ProductFilter(
    customPages: List<com.drewcore.waiter_app.data.models.CustomPage>,
    selectedCustomPage: com.drewcore.waiter_app.data.models.CustomPage?,
    categories: List<String>,
    selectedCategory: String?,
    onCustomPageSelected: (com.drewcore.waiter_app.data.models.CustomPage?) -> Unit,
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
                selected = selectedCategory == null && selectedCustomPage == null,
                onClick = {
                    onCategorySelected(null)
                    onCustomPageSelected(null)
                },
                label = { Text("Todos") }
            )
        }

        // Custom pages first (if any)
        if (customPages.isNotEmpty()) {
            items(customPages, key = { it.id }) { page ->
                FilterChip(
                    selected = selectedCustomPage?.id == page.id,
                    onClick = { onCustomPageSelected(page) },
                    label = { Text(page.name) }
                )
            }
        }

        // Then categories (if any)
        if (categories.isNotEmpty()) {
            items(categories, key = { it }) { category ->
                FilterChip(
                    selected = selectedCategory == category && selectedCustomPage == null,
                    onClick = { onCategorySelected(category) },
                    label = { Text(category) }
                )
            }
        }
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
        items(categories, key = { it }) { category ->
            FilterChip(
                selected = selectedCategory == category,
                onClick = { onCategorySelected(category) },
                label = { Text(category) }
            )
        }
    }
}

// Helper function to decode base64 image
fun decodeBase64ToBitmap(base64String: String): ImageBitmap? {
    return try {
        // Remove data URL prefix if present (e.g., "data:image/png;base64,")
        val cleanBase64 = base64String.substringAfter("base64,").ifBlank { base64String }

        // Decode base64 to byte array
        val decodedBytes = Base64.decode(cleanBase64, Base64.DEFAULT)

        // Convert byte array to bitmap
        val bitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)
        bitmap?.asImageBitmap()
    } catch (e: Exception) {
        null
    }
}

// Helper function to check if string is base64
fun isBase64Image(imageUrl: String): Boolean {
    return imageUrl.startsWith("data:image") ||
           (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://") && imageUrl.length > 100)
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
            // Product image with Coil lazy loading and automatic caching
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                if (!product.imageUrl.isNullOrBlank()) {
                    // Check if image is base64
                    if (isBase64Image(product.imageUrl)) {
                        // Decode and display base64 image
                        val bitmap = remember(product.imageUrl) {
                            decodeBase64ToBitmap(product.imageUrl)
                        }

                        if (bitmap != null) {
                            Image(
                                bitmap = bitmap,
                                contentDescription = product.name,
                                modifier = Modifier.fillMaxSize(),
                                contentScale = ContentScale.Crop
                            )
                        } else {
                            // Show error placeholder if base64 decoding failed
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
                    } else {
                        // Use Coil for URL images
                        SubcomposeAsyncImage(
                            model = ImageRequest.Builder(LocalContext.current)
                                .data(product.imageUrl)
                                .crossfade(200) // Smooth fade-in animation
                                .build(),
                            contentDescription = product.name,
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Crop,
                            loading = {
                                // Show loading indicator while loading
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
                            },
                            error = {
                                // Show placeholder if loading failed
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
                        )
                    }
                } else {
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
    customPrice: Double? = null,
    onModifiersChanged: (List<ProductModifier>) -> Unit,
    onNotesChanged: (String) -> Unit,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit
) {
    // Group modifiers by their group
    val modifiersByGroup = remember(product.modifiers) {
        product.modifiers?.groupBy { it.groupId ?: 0 } ?: emptyMap()
    }

    // Get unique groups (use first modifier's group info for each groupId)
    val groups = remember(product.modifiers) {
        product.modifiers
            ?.filter { it.group != null }
            ?.distinctBy { it.groupId }
            ?.associate { it.groupId!! to it.group!! }
            ?: emptyMap()
    }

    // Track selected modifiers by group for validation
    val selectedByGroup = remember(selectedModifiers) {
        selectedModifiers.groupBy { it.groupId ?: 0 }
    }

    var validationError by remember { mutableStateOf<String?>(null) }

    // Validate required groups
    fun validate(): Boolean {
        for ((groupId, group) in groups) {
            val selected = selectedByGroup[groupId]?.size ?: 0
            if (group.required && selected < group.minSelect) {
                validationError = "Seleccione al menos ${group.minSelect} opción(es) en ${group.name}"
                return false
            }
        }
        validationError = null
        return true
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column {
                Text(
                    text = product.name,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Personaliza tu orden",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 400.dp)
                    .verticalScroll(rememberScrollState())
                    .padding(vertical = 8.dp)
            ) {
                // Modifiers grouped by ModifierGroup
                if (!product.modifiers.isNullOrEmpty()) {
                    modifiersByGroup.forEach { (groupId, modifiersInGroup) ->
                        val group = groups[groupId]
                        val isMultiple = group?.multiple ?: true
                        val groupName = group?.name ?: "Modificadores"
                        val isRequired = group?.required ?: false
                        val maxSelect = group?.maxSelect ?: Int.MAX_VALUE

                        // Group header
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = groupName,
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.weight(1f)
                            )
                            if (isRequired) {
                                Surface(
                                    color = MaterialTheme.colorScheme.errorContainer,
                                    shape = MaterialTheme.shapes.extraSmall
                                ) {
                                    Text(
                                        text = "Requerido",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onErrorContainer,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                    )
                                }
                            }
                        }

                        if (group != null && (group.minSelect > 0 || group.maxSelect < Int.MAX_VALUE)) {
                            Text(
                                text = "(Mín: ${group.minSelect}, Máx: ${group.maxSelect})",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        // Modifiers in this group
                        modifiersInGroup.forEach { modifier ->
                            val isSelected = selectedModifiers.any { it.id == modifier.id }

                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        val currentGroupSelected = selectedByGroup[groupId]?.size ?: 0

                                        if (isMultiple) {
                                            // Checkbox behavior - toggle
                                            val newModifiers = if (isSelected) {
                                                selectedModifiers.filter { it.id != modifier.id }
                                            } else {
                                                // Check max select limit
                                                if (currentGroupSelected >= maxSelect) {
                                                    validationError = "Máximo $maxSelect opciones en $groupName"
                                                    return@clickable
                                                }
                                                validationError = null
                                                selectedModifiers + modifier
                                            }
                                            onModifiersChanged(newModifiers)
                                        } else {
                                            // Radio behavior - single select in group
                                            val otherGroupModifiers = selectedModifiers.filter {
                                                it.groupId != groupId
                                            }
                                            val newModifiers = if (isSelected) {
                                                otherGroupModifiers // Deselect
                                            } else {
                                                otherGroupModifiers + modifier // Select this one
                                            }
                                            validationError = null
                                            onModifiersChanged(newModifiers)
                                        }
                                    }
                                    .padding(vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                if (isMultiple) {
                                    Checkbox(
                                        checked = isSelected,
                                        onCheckedChange = null
                                    )
                                } else {
                                    RadioButton(
                                        selected = isSelected,
                                        onClick = null
                                    )
                                }
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = modifier.name,
                                    modifier = Modifier.weight(1f)
                                )
                                if (modifier.priceChange != 0.0) {
                                    Surface(
                                        color = if (modifier.priceChange > 0)
                                            MaterialTheme.colorScheme.primaryContainer
                                        else
                                            MaterialTheme.colorScheme.tertiaryContainer,
                                        shape = MaterialTheme.shapes.extraSmall
                                    ) {
                                        Text(
                                            text = "${if (modifier.priceChange > 0) "+" else ""}$${String.format("%.2f", modifier.priceChange)}",
                                            style = MaterialTheme.typography.labelMedium,
                                            color = if (modifier.priceChange > 0)
                                                MaterialTheme.colorScheme.onPrimaryContainer
                                            else
                                                MaterialTheme.colorScheme.onTertiaryContainer,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))
                        HorizontalDivider()
                        Spacer(modifier = Modifier.height(12.dp))
                    }
                }

                // Validation error
                validationError?.let { error ->
                    Surface(
                        color = MaterialTheme.colorScheme.errorContainer,
                        shape = MaterialTheme.shapes.small,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = error,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                    Spacer(modifier = Modifier.height(12.dp))
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
                val basePrice = customPrice ?: product.price
                val totalModifierPrice = selectedModifiers.sumOf { it.priceChange }

                Spacer(modifier = Modifier.height(16.dp))
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = if (customPrice != null) "Precio personalizado:" else "Precio base:",
                                style = MaterialTheme.typography.bodyMedium
                            )
                            Text(
                                text = "$${String.format("%.2f", basePrice)}",
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                        if (totalModifierPrice != 0.0) {
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
                        }
                        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
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
                                text = "$${String.format("%.2f", basePrice + totalModifierPrice)}",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (validate()) {
                        onConfirm()
                    }
                }
            ) {
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

@Composable
fun VariablePriceDialog(
    product: Product,
    onDismiss: () -> Unit,
    onConfirm: (Double) -> Unit
) {
    var priceText by remember { mutableStateOf("") }
    var isError by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "Precio Variable",
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp)
            ) {
                Text(
                    text = product.name,
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.padding(bottom = 16.dp)
                )

                Text(
                    text = "Ingresa el precio para este producto:",
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(bottom = 8.dp)
                )

                TextField(
                    value = priceText,
                    onValueChange = {
                        priceText = it
                        isError = false
                    },
                    label = { Text("Precio") },
                    placeholder = { Text("0.00") },
                    prefix = { Text("$") },
                    isError = isError,
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                        keyboardType = androidx.compose.ui.text.input.KeyboardType.Decimal
                    )
                )

                if (isError) {
                    Text(
                        text = "Por favor ingresa un precio válido",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val price = priceText.toDoubleOrNull()
                    if (price != null && price > 0) {
                        onConfirm(price)
                    } else {
                        isError = true
                    }
                }
            ) {
                Text("Continuar")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancelar")
            }
        }
    )
}
