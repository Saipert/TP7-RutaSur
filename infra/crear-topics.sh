#!/bin/sh
# Crea los seis topics del catalogo. La clave de particion es siempre shipmentId.
set -e
BOOTSTRAP="${KAFKA_BOOTSTRAP:-kafka:29092}"
DIAS_7=604800000
DIAS_30=2592000000

crear() {
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$BOOTSTRAP" --create --if-not-exists \
    --topic "$1" --partitions 3 --replication-factor 1 --config "$2"
}

crear envios.estados "retention.ms=$DIAS_30"
crear envios.promesas "cleanup.policy=compact"
crear envios.reprogramaciones "retention.ms=$DIAS_30"
crear alertas.sla "retention.ms=$DIAS_7"
crear notificaciones.enviadas "retention.ms=$DIAS_7"
crear envios.estados.dlq "retention.ms=$DIAS_30"

/opt/kafka/bin/kafka-topics.sh --bootstrap-server "$BOOTSTRAP" --list
