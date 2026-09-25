export const PRESETS = {
  camera: "port:554,5554,8554",
  cam_dahua: "product:Dahua",
  cam_hik: "product:Hikvision",
  cam_axis: "product:Axis",
  cam_onvif: "port:3702",
  cam_screenshot: "screenshot.label:webcam",
  databases: "port:3306,5432,27017,6379,9200",
  db_mongo: "product:MongoDB",
  mongo_open: '"MongoDB Server Information" port:27017 -authentication',
  db_redis: "product:Redis",
  db_mysql: "product:MySQL",
  db_postgres: "product:PostgreSQL",
  elastic: "product:Elastic port:9200",
  acc_rdp: "port:3389",
  ssh: "port:22",
  vnc: '"authentication disabled" port:5900',
  acc_telnet: "port:23",
  acc_winbox: "port:8291",
  indexof: 'http.title:"Index of /"',
  ftp: '"230 Login successful" port:21',
  files_smb: "port:445",
  files_rsync: "port:873",
  printers: "port:9100",
  scada: "port:502",
  dev_s7: "port:102",
  dev_upnp: "port:1900",
  heartbleed: "vuln:CVE-2014-0160",
  vuln_bluekeep: "vuln:CVE-2019-0708",
  vuln_eternalblue: "vuln:MS17-010",
  vuln_log4shell: "vuln:CVE-2021-44228",
};

export const CATEGORIES = [
  { id: "cameras", icon: "lucide:cctv", presets: ["camera", "cam_dahua", "cam_hik", "cam_axis", "cam_onvif", "cam_screenshot"] },
  { id: "databases", icon: "lucide:database", presets: ["databases", "db_mongo", "mongo_open", "db_redis", "db_mysql", "db_postgres", "elastic"] },
  { id: "access", icon: "lucide:monitor", presets: ["acc_rdp", "ssh", "vnc", "acc_telnet", "acc_winbox"] },
  { id: "files", icon: "lucide:folder-open", presets: ["indexof", "ftp", "files_smb", "files_rsync"] },
  { id: "devices", icon: "lucide:printer", presets: ["printers", "scada", "dev_s7", "dev_upnp"] },
  { id: "vulnerable", icon: "lucide:shield-alert", presets: ["heartbleed", "vuln_bluekeep", "vuln_eternalblue", "vuln_log4shell"] },
];

/** The Shodan query for a preset, with the country appended when one is chosen. Pure. */
export function presetQuery(preset, cc) {
  const base = PRESETS[preset];
  if (!base) return "";
  return cc && cc !== "all" ? `${base} country:${cc}` : base;
}

export const KIND_OF = (() => {
  const m = {};
  const kind = { cameras: "camera", databases: "database", access: "access", files: "files", devices: "device", vulnerable: "vuln" };
  for (const c of CATEGORIES) for (const p of c.presets) m[p] = kind[c.id];
  return m;
})();
