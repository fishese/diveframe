export function exportFileName(
  startDateTime: string | null,
  now = new Date(),
) {
  const match = startDateTime?.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/,
  );
  if (match) {
    return `diveframe-${match[1]}${match[2]}${match[3]} ${match[4]}-${match[5]}`;
  }
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const time = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join("-");
  return `diveframe-${date} ${time}`;
}
