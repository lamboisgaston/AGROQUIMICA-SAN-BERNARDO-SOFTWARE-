# 🚂 Configuración Railway PostgreSQL

## 1. Crear Base de Datos en Railway

### Opción A: Desde Railway Dashboard
1. Ve a [Railway.app](https://railway.app)
2. Login con tu cuenta
3. Click "New Project"
4. Selecciona "Database" → "PostgreSQL"
5. Elige plan (Starter es gratis: 512MB, 1GB storage)

### Opción B: Desde CLI (recomendado)
```bash
# Instalar Railway CLI
npm install -g @railway/cli

# Login
railway login

# Crear proyecto
railway init agroquimica-san-bernardo

# Agregar PostgreSQL
railway add postgresql
```

## 2. Obtener Variables de Conexión

### Desde Dashboard:
1. Ve a tu proyecto → PostgreSQL service
2. Click en "Variables" (o "Connect")
3. Copia las variables:
   - `PGHOST` (host)
   - `PGPORT` (5432)
   - `PGDATABASE` (railway)
   - `PGUSER` (postgres)
   - `PGPASSWORD` (tu password)

### Desde CLI:
```bash
# Ver variables del proyecto
railway variables

# O específicamente de PostgreSQL
railway connect postgresql
```

## 3. Configurar DATABASE_URL

### Formato correcto:
```
postgresql://[USER]:[PASSWORD]@[HOST]:5432/railway
```

### Ejemplo real:
```bash
# Reemplaza con tus valores reales
DATABASE_URL="postgresql://postgres:mi_password_seguro@containers-us-west-1.railway.app:5432/railway"
```

## 4. Probar Conexión

### Con Prisma:
```bash
# Probar conexión
npx prisma db push --preview-feature

# O generar cliente
npx prisma generate
```

### Con Node.js:
```javascript
// test-connection.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    await prisma.$connect();
    console.log('✅ Conexión exitosa a Railway!');
  } catch (error) {
    console.error('❌ Error de conexión:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
```

## 5. Variables de Entorno en Railway

### Configurar en Dashboard:
1. Ve a tu proyecto → Variables
2. Agrega:
   ```
   DATABASE_URL = postgresql://postgres:[PASSWORD]@[HOST]:5432/railway
   JWT_SECRET = tu_jwt_secret_seguro_aqui
   NODE_ENV = production
   PORT = 3000
   ```

### O desde CLI:
```bash
railway variables set DATABASE_URL="postgresql://..."
railway variables set JWT_SECRET="tu_secret_seguro"
railway variables set NODE_ENV="production"
```

## 6. Deploy en Railway

### Preparar proyecto:
```bash
# Asegurar que package.json tenga scripts correctos
{
  "scripts": {
    "start": "node dist/index.js",
    "build": "tsc",
    "dev": "ts-node src/index.ts"
  }
}
```

### Deploy:
```bash
# Conectar repo a Railway
railway link

# Deploy
railway up
```

## 7. Verificar Base de Datos

### Desde Railway Dashboard:
- Ve a PostgreSQL service → "Query" tab
- Ejecuta: `SELECT * FROM "Usuario" LIMIT 5;`

### Desde tu app:
- Login con usuario de prueba
- Crear un producto
- Verificar que se guarde en Railway

---

## ⚠️ Notas Importantes

1. **Backup automático**: Railway hace backups automáticos
2. **Migraciones**: Usa `prisma db push` para desarrollo, `prisma migrate deploy` para producción
3. **SSL**: Railway ya incluye SSL, no necesitas configurarlo
4. **Timezones**: Railway usa UTC, considera configurar timezone si necesitas
5. **Costos**: El plan Starter es gratis hasta ciertos límites

---

## 🔧 Comandos Útiles

```bash
# Ver logs de Railway
railway logs

# Ver estado del proyecto
railway status

# Conectar a base de datos directamente
railway connect postgresql

# Ver variables
railway variables

# Reiniciar servicio
railway restart
```