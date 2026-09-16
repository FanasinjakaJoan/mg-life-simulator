const paths = {
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m16 8-2.6 5.4L8 16l2.6-5.4Z" />
    </>
  ),
  mountain: (
    <>
      <path d="m2 19 7-12 4 6 3-9 7 15Z" />
      <path d="m6.5 11 2.5 2 2-2m3.5-3 2 2 1.5-1" />
    </>
  ),
  leaf: (
    <>
      <path d="M20 3C9 2 3 6 4 13s11 10 15-1Z" />
      <path d="M3 22 16 8M8 17l-1-6m5 2 5 1" />
    </>
  ),
  tree: (
    <>
      <path d="M10 22V12L5 9M14 22V12l5-3M10 15h4M9 6 6 3M15 6l3-3" />
      <path d="M4 10C-1 5 5 2 9 5c1-6 8-5 8 0 7-3 9 6 2 6H5Z" />
    </>
  ),
  cactus: (
    <>
      <path d="M10 22V5a2 2 0 0 1 4 0v17M10 15H7a3 3 0 0 1-3-3V8a2 2 0 0 1 4 0v3h2m4 7h3a3 3 0 0 0 3-3v-5a2 2 0 0 0-4 0v4h-2M6 22h12" />
    </>
  ),
  volcano: (
    <>
      <path d="m2 21 6-12h8l6 12ZM8 9l4 4 4-4M10 5l-1-3m5 3 2-3" />
    </>
  ),
  waves: (
    <>
      <path d="M2 7q3-4 6 0t6 0 6 0M2 12q3-4 6 0t6 0 6 0M2 17q3-4 6 0t6 0 6 0" />
    </>
  ),
  river: (
    <>
      <path d="M7 2c12 4-9 8 2 12s3 7 0 8M14 2c12 4-9 8 2 12s3 7 0 8" />
    </>
  ),
  arrow: (
    <>
      <path d="M4 12h16m-6-6 6 6-6 6" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  book: (
    <>
      <path d="M12 5c-4-3-7-3-10-2v16c3-1 6-1 10 2 4-3 7-3 10-2V3c-3-1-6-1-10 2Zm0 0v16" />
    </>
  ),
  map: (
    <>
      <path d="m2 5 7-3 6 3 7-3v17l-7 3-6-3-7 3Zm7-3v17m6-14v17" />
    </>
  ),
  pin: (
    <>
      <path d="M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 0 1 14 0Z" />
      <circle cx="12" cy="9" r="2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" />
    </>
  ),
  layers: (
    <>
      <path d="m2 8 10-6 10 6-10 6Zm0 5 10 6 10-6M2 18l10 6 10-6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  reset: (
    <>
      <path d="M3 10a9 9 0 1 1 1 8M3 3v7h7" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  check: <path d="m5 12 5 5L20 7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  sound: (
    <>
      <path d="m11 4-6 5H2v6h3l6 5Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
    </>
  ),
  mute: (
    <>
      <path d="m11 4-6 5H2v6h3l6 5Zm5 5 6 6m0-6-6 6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10v1" />
    </>
  ),
  flag: (
    <>
      <path d="M5 22V3c5-5 9 5 15 0v11c-6 5-10-5-15 0" />
    </>
  ),
  search: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 6 6" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="8" cy="6" r="2" />
      <circle cx="16" cy="12" r="2" />
      <circle cx="10" cy="18" r="2" />
    </>
  ),
}
export function Icon({ name, size = 20, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.compass}
    </svg>
  )
}
