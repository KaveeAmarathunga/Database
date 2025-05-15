const { InfluxDB } = require('@influxdata/influxdb-client');

const influx = new InfluxDB({
  url: 'http://localhost:8086',  // Replace with your InfluxDB URL
  token: 'influx config create -n default -u http://localhost:8086 -t DSvMtfL-lZlbX2MvtpINLqQLGvy7sXO_rM8_leu03R_DA2cX0oGkTrvqQQL8on7ihLDgr2ciB-TU1xFjnY8Tiw=='      // Replace with your InfluxDB token
});

const writeApi = influx.getWriteApi('test', 'iot'); // Replace with your organization and bucket name

// Function to write data to InfluxDB
function writeData(measurement, data) {
  const { nodeId, value, timestamp } = data;

  try {
    const point = new InfluxDB.Point(measurement)
      .tag('nodeId', nodeId)
      .floatField('value', value)
      .timestamp(timestamp);

    writeApi.writePoint(point);
    writeApi.flush();  // Ensure data is written immediately
    console.log(`Data written to InfluxDB: ${measurement} | ${nodeId} | ${value}`);
  } catch (err) {
    console.error("Error writing data to InfluxDB:", err);
  }
}

module.exports = { writeData };
