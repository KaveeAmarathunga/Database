const opcua = require("node-opcua");
const { InfluxDB, Point } = require("@influxdata/influxdb-client");

// OPC UA setup
const client = opcua.OPCUAClient.create({ endpointMustExist: false });
const endpointUrl = "opc.tcp://192.168.1.2:4840";

// InfluxDB setup
const influx = new InfluxDB({
  url: "http://localhost:8086",
  token: "DSvMtfL-lZlbX2MvtpINLqQLGvy7sXO_rM8_leu03R_DA2cX0oGkTrvqQQL8on7ihLDgr2ciB-TU1xFjnY8Tiw==",
});
const writeApi = influx.getWriteApi("test", "iot");
writeApi.useDefaultTags({ location: "plant1" });

// Format UTC to Sri Lanka time (with milliseconds) for logging only
function formatSriLankaTime(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find(p => p.type === type)?.value || "00";

  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");

  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}.${milliseconds}`;
}


// Recursive variable browser
async function findAllVariableNodes(session, startNodeId) {
  let allVariables = [];

  async function browseRecursively(nodeId) {
    const browseResult = await session.browse(nodeId);
    for (const ref of browseResult.references) {
      const childNodeId = ref.nodeId.toString();
      if (childNodeId.startsWith("ns=4;i=")) {
        if (ref.nodeClass === opcua.NodeClass.Variable) {
          allVariables.push({ nodeId: childNodeId, name: ref.browseName.name });
        } else if (ref.nodeClass === opcua.NodeClass.Object) {
          await browseRecursively(ref.nodeId);
        }
      }
    }
  }

  await browseRecursively(startNodeId);
  return allVariables;
}

// Main function
async function main() {
  try {
    console.log("Connecting to OPC UA server at:", endpointUrl);
    await client.connect(endpointUrl);
    console.log("✅ Connected to OPC UA server");

    const session = await client.createSession();
    console.log("✅ Session created");

    const subscription = opcua.ClientSubscription.create(session, {
      requestedPublishingInterval: 1000,
      requestedLifetimeCount: 100,
      requestedMaxKeepAliveCount: 10,
      maxNotificationsPerPublish: 100,
      publishingEnabled: true,
      priority: 10,
    });

    console.log("🔍 Searching for all ns=4;i=* variable nodes...");
    const allVariables = await findAllVariableNodes(session, "ns=4;i=1");

    console.log(`📦 Found ${allVariables.length} variable nodes in ns=4`);
    allVariables.forEach((v) => {
      console.log(`- ${v.name} (${v.nodeId})`);
    });

    // Log heartbeat every 10s
    setInterval(() => {
      console.log("⏳ Still receiving data...");
    }, 10000);

    // Subscribe to each variable
    for (const variable of allVariables) {
      const nodeId = variable.nodeId;
      console.log("📡 Subscribing to:", nodeId);

      const monitoredItem = opcua.ClientMonitoredItem.create(
        subscription,
        { nodeId: opcua.resolveNodeId(nodeId), attributeId: opcua.AttributeIds.Value },
        { samplingInterval: 1000, discardOldest: true, queueSize: 10 },
        opcua.TimestampsToReturn.Both
      );

      monitoredItem.on("changed", (dataValue) => {
        const value = dataValue.value.value;
        const timestamp = dataValue.serverTimestamp || new Date();
        const slTime = formatSriLankaTime(timestamp);

        console.log(`📥 ${nodeId} → ${value} | 🇱🇰 ${slTime}`);

        const point = new Point("solar_data")
          .tag("nodeId", nodeId)
          .floatField("value", value)
          .timestamp(timestamp); // UTC for InfluxDB

        try {
          writeApi.writePoint(point);
        } catch (err) {
          console.error("❌ InfluxDB write error:", err);
        }
      });
    }

    // Cleanup on exit
    process.on("SIGINT", async () => {
      console.log("\n🧼 Shutting down...");
      await writeApi.flush();
      await writeApi.close();
      await session.close();
      await client.disconnect();
      console.log("✅ Cleaned up. Bye!");
      process.exit(0);
    });

  } catch (err) {
    console.error("❌ Fatal error:", err);
  }
}

main();
