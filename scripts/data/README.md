# Submarine cable data

`submarine-cables.json` here and `src/data/cables.json` are adapted from
**TeleGeography's Submarine Cable Map** (https://www.submarinecablemap.com),
as TeleGeography published it on GitHub (`telegeography/www.submarinecablemap.com`,
snapshot 2022-08-05) under the
[Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported licence](https://creativecommons.org/licenses/by-nc-sa/3.0/).

Changes: reformatted into compact JSON (cables with owners, ready-for-service
year, length, landing stations and geometry; landing stations with country
codes), coordinates rounded to 0.001° here and 0.01° in the base map.

These files are shared under the same licence:

- **Attribution**: credit TeleGeography (the map shows "海纜資料 © TeleGeography
  2022 · CC BY-NC-SA 3.0" with links whenever the cables are drawn).
- **NonCommercial**: no commercial use. The rest of the theme carries no such
  restriction; remove these two files for a commercial deployment.
- **ShareAlike**: adaptations go out under the same licence.

The original repository has been removed from GitHub; the snapshot is
preserved by the Internet Archive. The lines are stylised drawings, not
surveyed cable routes.
