# Third-party design automation research

The Photoshop V3 capability layer was implemented as ANKSEN-owned code. No third-party runtime is bundled into the UXP plugin. The following open-source projects were reviewed in isolated temporary directories and influenced the engineering approach:

- [Alchemist](https://github.com/jardicc/alchemist), commit `8a0d7338b6d33bc60a69e6f40873482619c7da79`, MIT. Used as an Action Manager descriptor discovery and inspection reference.
- [UXP Toolkit](https://github.com/bubblydoo/uxp-toolkit), commit `0e45fddc1185d9253909cffae27fe1bcb6463a44`, MIT. Its typed-command approach and mask/adjustment helpers informed the static descriptor boundary.
- [photoshop-mcp](https://github.com/alisaitteke/photoshop-mcp), commit `15498cb5d0f9ad5e1b457212a56744d459e49cb9`, MIT. Evaluated as an optional external control-plane adapter; not bundled because its arbitrary-script, analytics, AppleScript, and separate server runtime surfaces do not match the default Studio governance boundary.
- [PhotoshopAPI](https://github.com/EmilDohne/PhotoshopAPI), commit `055cad5254390d164b9a2ee8591d5b8f4f6758cc`, BSD-3-Clause. Evaluated as a future offline PSD/PSB QA and mutation engine; not bundled in the UXP plugin.
- [psd-tools](https://github.com/psd-tools/psd-tools), MIT. Evaluated as a future independent parser/QA layer.

The plugin accepts only ANKSEN's typed operations. Jobs cannot submit raw Action Manager descriptors, JavaScript, JSX, `eval`, or filesystem paths.
