# Decisiones de diseño

| Decisión | Elección | Motivo |
|----------|----------|--------|
| Garantía de entrega | Al menos una vez, con consumidores idempotentes | Es simple y no pierde eventos |
| Confirmación de offsets | Manual, después de escribir en MongoDB | Un fallo a mitad de proceso reintenta el evento |
| Particiones | 3, con `shipmentId` como clave | Muestra reparto de carga y mantiene el orden por envío |
| Formato de eventos | JSON con validación de esquema (Ajv) en cada consumidor | Legible y sin componentes extra |
| Monitor de SLA | Consumidor propio, con estado en memoria y respaldo en MongoDB | La lógica queda a la vista y sobrevive a un reinicio |
| Kafka en local | Un broker en modo KRaft | Un solo contenedor, sin ZooKeeper |
| Tiempo real en la interfaz | Change streams más SSE | El frontend no depende de Kafka y el flujo es de un solo sentido |

## Decisiones tomadas donde la especificación no define

- **`ZONA_INACCESIBLE` queda retenido.** La especificación solo dice que los motivos distintos de ausente sacan al envío del circuito. Repetir el intento no resuelve una zona inaccesible, así que se trata como una dirección incorrecta.
- **Identificadores deterministas en los eventos derivados.** Si un servicio se cae entre publicar y confirmar, vuelve a publicar el mismo `eventId` y el proyector lo descarta. Así, un `ENTREGA_FALLIDA` genera exactamente una notificación y una reprogramación.
- **Reloj del monitor.** Avanza con el `ocurridoEn` de los eventos y nunca retrocede. Si no llegan eventos, sigue al ritmo del factor de aceleración: si no, una alerta por ausencia de eventos no se dispararía nunca.
- **`promesaVenceEn` viaja en `ENTREGADO`.** El servicio de analítica solo consume `envios.estados`, y necesita la promesa para calcular el cumplimiento de SLA.
- **Cada consumidor deriva a la DLQ.** Un evento malformado genera un mensaje por grupo, con el grupo en el header `x-consumidor`.
- **Un evento fuera de orden se descarta sin volver atrás.** Lo pide la regla de orden del proyector, así que ese evento no aparece en el historial del envío.
- **Los escenarios acortan la espera.** El reintento real es al día hábil siguiente (12 minutos reales). En los escenarios de la demo los pasos se acortan, pero la reprogramación informa la fecha que corresponde.
- **Notificaciones ante alertas altas y críticas.** Las de prioridad media son internas: el destinatario no necesita enterarse de que su envío se acerca al plazo.
