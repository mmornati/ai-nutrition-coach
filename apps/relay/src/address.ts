// The key a client address is limited under. IPv4 is the address itself. IPv6 is the /64 it belongs
// to (one household or one phone gets a whole /64, so per-address limits would otherwise be
// dodged by changing the low bits): the address is expanded to its 16 bytes first, so every way of
// writing the same prefix ("2001:db8::1", "2001:0db8:0:0:0:0:0:2", "2001:DB8:0:0::9") is one key.

const IPV4 = /^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$/;

function v4Groups(text: string): [string, string] | null {
  const match = IPV4.exec(text);
  if (match === null) return null;
  const parts = match.slice(1, 5).map(Number);
  if (parts.some((n) => n > 255)) return null;
  const [a = 0, b = 0, c = 0, d = 0] = parts;
  return [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)];
}

/** The 8 sixteen-bit groups of an IPv6 address, or `null` when the text is not one. */
export function expandIpv6(input: string): number[] | null {
  let text = input.trim().toLowerCase();
  const zone = text.indexOf('%');
  if (zone >= 0) text = text.slice(0, zone);
  if (!text.includes(':') || text.split('::').length > 2) return null;
  // A dotted IPv4 tail ("::ffff:1.2.3.4") stands for its last two groups.
  const lastColon = text.lastIndexOf(':');
  const tail = text.slice(lastColon + 1);
  if (tail.includes('.')) {
    const groups = v4Groups(tail);
    if (groups === null) return null;
    text = `${text.slice(0, lastColon + 1)}${groups[0]}:${groups[1]}`;
  }
  const [head = '', rest] = text.split('::');
  const side = (part: string): string[] => (part === '' ? [] : part.split(':'));
  const left = side(head);
  const right = rest === undefined ? [] : side(rest);
  const missing = 8 - left.length - right.length;
  if (rest === undefined ? missing !== 0 : missing < 1) return null;
  const all = [...left, ...Array<string>(rest === undefined ? 0 : missing).fill('0'), ...right];
  const numbers = all.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return numbers.length === 8 && numbers.every((n) => Number.isInteger(n)) ? numbers : null;
}

/** The limiter key for an address as text: IPv4 as is, IPv6 as its /64, anything else as is. */
export function addressKey(address: string): string {
  const groups = expandIpv6(address);
  if (groups === null) return address;
  // "::ffff:a.b.c.d" is the IPv4 address a.b.c.d reaching an IPv6 socket.
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const high = groups[6] ?? 0;
    const low = groups[7] ?? 0;
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16).padStart(4, '0'))
    .join(':')}::/64`;
}
