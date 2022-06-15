/**
 * 4.3 设计一个完善的响应式系统
 */

// 用一个全局变量存储被注册的副作用函数
let activeEffect;
// effect 用于注册副作用函数,这样副作用函数名字不用固定同时也可以添加匿名函数
const effect = (fn) => {
  activeEffect = fn;
  fn();
};
// 存储副作用函数的桶
// weakMap 对 key 是弱引用，不影响垃圾回收，如果 target 对象没有引用，说明用户侧不再需要它，垃圾回收机制会完成任务
const bucket = new WeakMap();

// 原始数据
const data = { text: "hello world" };

// 对原始数据的代理
const obj = new Proxy(data, {
  // 拦截读取操作
  get(target, key) {
    // 将副作用函数 activeEffect 添加到桶中
    track(target, key);
    return target[key];
  },
  set(target, key, newVal) {
    target[key] = newVal;
    // 把副作用函数从桶里拿出来执行
    trigger(target, key);
    return true;
  },
});

// 在 get 拦截函数内调用 track 函数追踪变化
function track(target, key) {
  if (!activeEffect) return;
  // 根据 target 从桶中取得 depsMap, 它是一个 Map 类型： key: deps
  let depsMap = bucket.get(target);
  if (!depsMap) {
    // 如果不存在，就创建一个 Map 并与 target 关联
    bucket.set(target, (depsMap = new Map()));
  }
  // 再根据 key 从 depsMap 中取得 deps 是一个 Set 类型
  // 里面存储着所有与当前 key 相关联的 effect 函数
  let deps = depsMap.get(key);
  if (!deps) {
    depsMap.set(key, (deps = new Set()));
  }
  // 将当前激活的副作用函数添加到桶里
  deps.add(activeEffect);
}

function trigger(target, key) {
  // 根据 target 从桶里取得 depsMap
  const depsMap = bucket.get(target);
  if (!depsMap) return;
  // 根据 key 取得副作用函数并执行
  const effects = depsMap.get(key);
  effects && effects.forEach((fn) => fn());
  // 返回 true 代表设置成功
}

// 副作用函数
effect(() => {
  document.body.innerText = obj.text;
});

setTimeout(() => {
  obj.text = "hello vue3";
}, 1000);
