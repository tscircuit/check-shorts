export const twoNetNoShortRepro = (
  <board width="12mm" height="8mm">
    <resistor
      name="R1"
      resistance="1k"
      footprint="0402"
      pcbX="-2.5mm"
      schX="-2mm"
    />
    <capacitor
      name="C1"
      capacitance="100nF"
      footprint="0402"
      pcbX="2.5mm"
      schX="2mm"
    />
    <trace from=".R1 > .pin1" to=".C1 > .pin1" />
    <trace from=".R1 > .pin2" to="net.GND" />
    <trace from=".C1 > .pin2" to="net.VCC" />
  </board>
);

export const copperBridgeShortRepro = (
  <board width="12mm" height="8mm">
    <resistor
      name="R1"
      resistance="1k"
      footprint="0402"
      pcbX="-2.5mm"
      schX="-2mm"
    />
    <capacitor
      name="C1"
      capacitance="100nF"
      footprint="0402"
      pcbX="2.5mm"
      schX="2mm"
    />
    <trace from=".R1 > .pin1" to=".C1 > .pin1" />
    <trace from=".R1 > .pin2" to="net.GND" />
    <trace from=".C1 > .pin2" to="net.VCC" />
  </board>
);
