import "dotenv/config";
import express from "express";
import authRoutes from "./auth";
import productosRoutes from "./productos";

const app = express();

app.use(express.json());

app.use("/auth", authRoutes);
app.use("/productos", productosRoutes);

app.get("/", (_req, res) => {
  res.send("Agroquimica San Bernardo API");
});

app.listen(3000, () => {
  console.log("Servidor corriendo en puerto 3000");
});