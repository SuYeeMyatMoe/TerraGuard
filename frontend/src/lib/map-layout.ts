/** Reserve UI space without leaving a narrow or short canvas with no visible map. */
export function mapPadding(width: number, height: number, overview = false) {
  if (width < 1024) {
    return { top: Math.min(64, height * 0.2), bottom: Math.min(80, height * 0.25), left: 24, right: 24 };
  }
  return {
    top: overview ? Math.min(90, height * 0.2) : 0,
    bottom: overview ? Math.min(230, height * 0.3) : 0,
    left: 300,
    right: 420,
  };
}
