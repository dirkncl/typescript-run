// index.ts
import * as easing from './src/index';


var width = 300;
var height = 150;
export default function test(container) {

    var funcs = [ easing.backInOut, easing.backIn, easing.backOut, easing.bounceInOut, easing.bounceIn, easing.bounceOut, easing.circInOut, easing.circIn, easing.circOut, easing.cubicInOut, easing.cubicIn, easing.cubicOut, easing.elasticInOut, easing.elasticIn, easing.elasticOut, easing.expoInOut, easing.expoIn, easing.expoOut, easing.linear, easing.quadInOut, easing.quadIn, easing.quadOut, easing.quartInOut, easing.quartIn, easing.quartOut, easing.quintInOut, easing.quintIn, easing.quintOut, easing.sineInOut, easing.sineIn, easing.sineOut ];

    for (var f of funcs) {
        var box = document.createElement('div')
        box.className = 'box'
        var title = document.createElement('h2')
        title.innerHTML = f.name
        var canvas = document.createElement('canvas')
        canvas.width = width;
        canvas.height = height;
        drawFunction(canvas, f);
        box.appendChild(title);
        box.appendChild(canvas);
        container.appendChild(box);
    }
};

function drawFunction(canvas, f) {
    function canvasCoord(x, y) {
        return [width * x, height * (1 - y)]
    }

    var ctx = canvas.getContext('2d');
    ctx.beginPath();
    for (let x = 0; x <= 1; x += 0.01) {
        var y = f(x)
        var coords = canvasCoord(x, y);
        ctx.lineTo(coords[0], coords[1]);
    }
    ctx.stroke();
}

