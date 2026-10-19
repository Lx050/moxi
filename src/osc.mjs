function oscString(s) {
  const bytes = Buffer.from(s + '\0');
  return Buffer.concat([bytes, Buffer.alloc((4 - bytes.length % 4) % 4)]);
}

export function oscFloat(address, value) {
  if (!/^\/[a-z0-9_/]+$/i.test(address) || !Number.isFinite(value)) throw new TypeError('Invalid OSC data');
  const number = Buffer.alloc(4);
  number.writeFloatBE(value);
  return Buffer.concat([oscString(address), oscString(',f'), number]);
}
