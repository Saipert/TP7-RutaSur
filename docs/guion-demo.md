# Guion de la demo

Dura unos 15 minutos y recorre los cuatro casos de uso más dos fallos provocados.

Antes de empezar, dejá abiertas la [torre de control](http://localhost:3000), el [panel de demo](http://localhost:3000/demo), la [analítica](http://localhost:3000/analitica) y [Kafka UI](http://localhost:8080).

1. **Arranque.** Levantá el entorno con `docker compose up --build`. El simulador empieza el flujo continuo y los contadores de la torre de control se mueven. *Concepto: todo el entorno sale con un solo comando.*
2. **Envío feliz.** En el panel, tocá "Envío feliz" y abrí su tracking. Se sigue hasta "Entregado". *Concepto: productor, consumidor y proyección.*
3. **Ausente.** Tocá "Ausente" y abrí el detalle. Aparecen, casi a la vez, la notificación y la reprogramación, y el fallo suma en analítica. *Concepto: tres grupos de consumidores sobre un mismo evento.*
4. **Demorado.** Tocá "Demorado". Unos segundos después, la alerta aparece en la cola con prioridad alta, antes del vencimiento. Cuando el envío se entrega, se cierra. *Concepto: procesamiento con estado y tiempo.*
5. **Caída de un servicio.** Ejecutá `docker compose stop notificaciones`. El tracking y las alertas siguen funcionando, y en Kafka UI crece el lag del grupo `notificaciones`. Con `docker compose start notificaciones` procesa lo pendiente sin duplicar avisos. *Concepto: aislamiento, offsets e idempotencia.*
6. **Evento inválido.** Tocá "Evento inválido". Aparece en `envios.estados.dlq`, con el motivo en los headers, y el flujo no se detiene. *Concepto: manejo de errores.*
7. **Analítica.** Abrí el panel y buscá la zona y la franja con más fallos (`Z6`, por su tasa simulada del 30%). Mejora a plantear: ofrecer franja vespertina en esa zona.
8. **Reprocesamiento.** Ejecutá `docker compose --profile cuarto-indicador up -d analitica-hub`. Un grupo nuevo lee el histórico y el cuarto indicador se completa con datos anteriores a su creación. *Concepto: retención y replay.*

Los pasos 5 y 8 son los que distinguen esta solución de una basada en una cola tradicional o en llamadas REST encadenadas.

## Comprobaciones adicionales

**Ver el lag de los grupos:**

```bash
docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka:29092 --describe --all-groups
```

**Reconstruir las vistas desde el log:**

```bash
docker compose stop proyector
docker compose run --rm -e REPROYECTAR=true proyector
```

**Comparar los indicadores con un recuento sobre Kafka:**

```bash
npm run recuento
```
