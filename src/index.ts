import express from "express";

const app = express();
app.use(express.json());

app.get("/", (_, res) => {
  res.send("Agroquimica San Bernardo API");
});

app.listen(3000, () => {
  console.log("Servidor corriendo en puerto 3000");
});
