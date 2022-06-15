/**
 * 4.2 响应式数据的基本实现
 * 硬编码  不够灵活 副作用函数只能是 effect 名字
 */

// 存储副作用函数的桶
const bucket = [];

// 原始数据
const data = { text: "hello world" };

// 对原始数据的代理
const obj = new Proxy(data, {
  // 拦截读取操作
  get(target, key) {
    // 将副作用函数 effect 添加到存储副作用函数的桶中
    bucket.push(effect);
    return target[key];
  },
  set(target, key, newVal) {
    target[key] = newVal;
    // 把副作用函数从桶中取出并执行
    bucket.forEach((fn) => fn());
    // 返回 true 代表设置成功
    return true;
  },
});

// 副作用函数
function effect() {
  document.body.innerText = obj.text;
}
// 执行副作用函数
effect();
setTimeout(() => {
  obj.text = "hello vue3";
}, 1000);
