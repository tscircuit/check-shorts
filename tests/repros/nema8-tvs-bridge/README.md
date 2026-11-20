# NEMA8 TVS VM-to-GND bridge false negative

The literal
[`ShiboSoftwareDev/nema8-20mm-dual-usbc-stepper-controller`](https://tscircuit.com/ShiboSoftwareDev/nema8-20mm-dual-usbc-stepper-controller)
v1.0.48 board has a bottom-copper VM trace that ends on `D_VM_TVS.pin2`,
which belongs to GND. The published board therefore has a physical VM-to-GND
bridge, but both PCB and Gerber modes currently return zero shorts.

## Run

```sh
bun test tests/repros/nema8-tvs-bridge
```

The fixture was introduced in a reproduction-only PR that asserted the false
negative. The follow-up fix keeps the literal fixture unchanged and requires
both PCB and Gerber modes to report the TVS short.

## Literal fixture and provenance

- Published board: <https://tscircuit.com/ShiboSoftwareDev/nema8-20mm-dual-usbc-stepper-controller#pcb>
- Package version: `1.0.48`.
- `nema8-controller.circuit.json`: **1,473,700 bytes**.
- SHA-256: `32f2eaaa2d3878ec108a9f8789e857d26a17b4bebeddd2d4aabfb1d923c373c1`.

The Circuit JSON is checked in byte-for-byte rather than minimized or rebuilt.
A checksum test protects that property. The complete fixture matters because
its PCB endpoint metadata is what hides the short; a reduced geometric fixture
does not reproduce the same connectivity-map behavior.

## Exact defect

| Item | Literal Circuit JSON value |
| --- | --- |
| VM source trace | `source_trace_8`, `CONTROLLER_PCB_connectivity_net2` |
| Routed PCB trace | `source_trace_3__source_trace_4__source_trace_5__source_trace_6__source_trace_7__source_trace_8__source_trace_9__source_trace_10__source_trace_11_mst7_0` |
| Trace endpoint | `pcb_port_150` at x = 1.86916, y = 3.5 mm |
| Endpoint source port | `source_port_150`, `D_VM_TVS.pin2` |
| Endpoint intended net | `CONTROLLER_PCB_connectivity_net33` (GND) |
| Copper layer | bottom |

The full connectivity map trusts `end_pcb_port_id` and consequently merges the
VM and GND identifiers. The checker now uses each copper element's source
connectivity key as its intended net when that metadata is available, while
retaining the full-connectivity fallback for elements without source metadata.
