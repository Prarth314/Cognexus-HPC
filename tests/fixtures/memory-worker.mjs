// The parent's fixed 128 MiB worker heap must terminate this synthetic fixture.
const retained = [];
while (true) retained.push(new Array(100000).fill(1));
