# API Documentation - Agroquímica San Bernardo

## 🔐 Autenticación

### Login
```
POST /auth/login
Content-Type: application/json

{
  "email": "usuario@email.com",
  "password": "contraseña"
}

Response:
{
  "mensaje": "Login exitoso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": {
    "id": "uuid",
    "nombre": "Juan",
    "email": "usuario@email.com",
    "rol": "GERENTE"
  }
}
```

### Registrar
```
POST /auth/registro
Content-Type: application/json

{
  "nombre": "Juan Pérez",
  "email": "juan@email.com",
  "password": "password123",
  "rol": "MOSTRADOR" // DUENO, GERENTE, CAJA, MOSTRADOR
}
```

**Todos los endpoints requieren header:**
```
Authorization: Bearer <token>
```

---

## 👥 Usuarios (DUENO solo)

### Listar usuarios
```
GET /usuarios
Headers: Authorization: Bearer <token>
```

### Crear usuario (DUENO)
```
POST /usuarios
{
  "nombre": "Carlos",
  "email": "carlos@email.com",
  "password": "pass123",
  "rol": "CAJA"
}
```

### Actualizar usuario (DUENO o el mismo usuario)
```
PATCH /usuarios/:id
{
  "nombre": "Carlos García",
  "password": "newpass123"  // opcional
}
```

### Desactivar usuario (DUENO)
```
DELETE /usuarios/:id
```

---

## 📋 Presupuestos

### Crear presupuesto (con teléfono obligatorio)
```
POST /presupuestos
{
  "clienteId": "uuid",
  "items": [
    {
      "productoId": "uuid",
      "cantidad": 2
    }
  ]
}

⚠️ REGLA: Cliente DEBE tener teléfono
✅ Mail es opcional
```

### Listar presupuestos
```
GET /presupuestos
```

### Cambiar estado de presupuesto
```
PATCH /presupuestos/:id
{
  "estado": "ACEPTADO" // PENDIENTE, ACEPTADO, RECHAZADO, CONVERTIDO
}
```

---

## 💳 Ventas (CAJA o MOSTRADOR)

### Crear venta (CON_FACTURA o SIN_FACTURA)
```
POST /ventas
{
  "clienteId": "uuid",
  "tipoVenta": "CON_FACTURA", // OBLIGATORIO: CON_FACTURA o SIN_FACTURA
  "items": [
    {
      "productoId": "uuid",
      "cantidad": 5
    }
  ]
}

⚠️ VAL IDACIÓN:
- Tipo venta es obligatorio
- Se valida stock disponible
- SIN_FACTURA = registra en cuenta corriente
```

### Listar ventas
```
GET /ventas
```

---

## 💰 Caja (CAJA)

### Abrir caja
```
POST /caja/abrir
{
  "montoInicial": 500
}
```

### Cerrar caja
```
POST /caja/cerrar
{
  "montoFinal": 750
}

Response: Diferencia calculada automáticamente
{
  "montoInicial": 500,
  "montoFinal": 750,
  "diferencia": 250
}
```

### Ver apertura activa
```
GET /caja/apertura-activa
```

### Ver todos los movimientos (CAJA, GERENTE, DUENO)
```
GET /caja/movimientos
```

---

## 👤 Cuenta Corriente

### Listar todas las cuentas (CAJA, GERENTE, DUENO)
```
GET /cuenta-corriente
```

### Ver cuenta de un cliente
```
GET /cuenta-corriente/:clienteId
```

### Registrar pago (CAJA, GERENTE)
```
POST /cuenta-corriente/:clienteId/pago
{
  "monto": 1000,
  "metodo": "EFECTIVO" // EFECTIVO, CHEQUE, TRANSFERENCIA
}

⚠️ No permite pagar más de lo que se debe
```

### Ver resumen de deudas (GERENTE, DUENO)
```
GET /cuenta-corriente/reporte/resumen
```

---

## 🔍 Auditoría

Todas las operaciones importantes quedan registradas en la tabla `auditoria`:
- CREATE_USUARIO
- CREATE_PRESUPUESTO
- CREATE_VENTA
- APERTURA_CAJA
- CIERRE_CAJA
- PAGO_CUENTA_CORRIENTE

---

## 🛡️ Control de Acceso por Rol

| Endpoint | DUENO | GERENTE | CAJA | MOSTRADOR |
|----------|-------|---------|------|-----------|
| POST /usuarios | ✅ | ❌ | ❌ | ❌ |
| DELETE /usuarios | ✅ | ❌ | ❌ | ❌ |
| POST /presupuestos | ✅ | ✅ | ✅ | ✅ |
| POST /ventas | ❌ | ❌ | ✅ | ✅ |
| POST /caja/abrir | ❌ | ❌ | ✅ | ❌ |
| POST /caja/cerrar | ❌ | ❌ | ✅ | ❌ |
| POST /cuenta-corriente/:id/pago | ❌ | ✅ | ✅ | ❌ |
| GET /cuenta-corriente/reporte/resumen | ✅ | ✅ | ❌ | ❌ |

---

## 📦 Instalación y Setup

```bash
# 1. Instalar dependencias
npm install

# 2. Crear .env con valores
cp .env.example .env
# Editar .env con DATABASE_URL y JWT_SECRET

# 3. Crear base de datos y tablas
npx prisma db push

# 4. Ejecutar en desarrollo
npm run dev

# 5. Construir para producción
npm run build
npm start
```

---

## ⚠️ Reglas de Negocio

1. **Presupuesto**: Teléfono OBLIGATORIO, mail opcional
2. **Ventas**: SIEMPRE CON_FACTURA o SIN_FACTURA
3. **Auditoría**: Toda operación registra qué usuario la hizo
4. **Caja**: Apertura y cierre obligatorios
5. **Cuenta Corriente**: Saldo + pagos + vencimientos
6. **Stock**: Se decrementa automáticamente en ventas
