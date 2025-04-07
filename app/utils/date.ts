export const formatTime = (ms: number) => {
  const date = new Date(ms)
  return `${date.getUTCMinutes()}m ${date.getUTCSeconds()}s ${date.getUTCMilliseconds()}ms`
}
