package com.drewcore.waiter_app.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DeliveryDining
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

data class DeliveryInfo(
    val customerName: String = "",
    val address: String = "",
    val phone: String = ""
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeliveryInfoDialog(
    onDismiss: () -> Unit,
    onConfirm: (DeliveryInfo) -> Unit,
    initialData: DeliveryInfo = DeliveryInfo()
) {
    var customerName by remember { mutableStateOf(initialData.customerName) }
    var address by remember { mutableStateOf(initialData.address) }
    var phone by remember { mutableStateOf(initialData.phone) }

    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Icon(
                imageVector = Icons.Default.DeliveryDining,
                contentDescription = "Delivery",
                tint = MaterialTheme.colorScheme.primary
            )
        },
        title = {
            Text(text = "Información de Domicilio")
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Info text
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.primaryContainer
                    )
                ) {
                    Text(
                        text = "Todos los campos son opcionales. Esta información aparecerá en el recibo impreso.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                        modifier = Modifier.padding(12.dp)
                    )
                }

                // Customer name
                OutlinedTextField(
                    value = customerName,
                    onValueChange = { customerName = it },
                    label = { Text("Nombre del Cliente") },
                    placeholder = { Text("Nombre completo (opcional)") },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = "Name"
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                // Address
                OutlinedTextField(
                    value = address,
                    onValueChange = { address = it },
                    label = { Text("Dirección de Entrega") },
                    placeholder = { Text("Dirección completa (opcional)") },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.LocationOn,
                            contentDescription = "Address"
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                    maxLines = 3
                )

                // Phone
                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = { Text("Teléfono de Contacto") },
                    placeholder = { Text("Número de teléfono (opcional)") },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Phone,
                            contentDescription = "Phone"
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onConfirm(
                        DeliveryInfo(
                            customerName = customerName.trim(),
                            address = address.trim(),
                            phone = phone.trim()
                        )
                    )
                }
            ) {
                Icon(
                    imageVector = Icons.Default.DeliveryDining,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Confirmar")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancelar")
            }
        }
    )
}
