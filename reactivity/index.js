/**
 * 4.9 watch 的实现原理
 * 所谓 watch 其本质就是 观测一个响应式数据，当数据发生变化时通知并执行相应的回调函数
 */

// 用一个全局变量存储被注册的副作用函数
let activeEffect;
// 用数组模拟栈元素 存放当前正在执行的副作用函数
let effectStack = [];

// 计算属性
function computed(getter) {
  // value 用来缓存上一次的执行结果,解决了呼缓存问题
  let value;
  // dirty 标志，用来标识是否需要重新计算，为 true 时意味着脏，需要计算
  let dirty = true;
  // 把 getter 作为副作用函数，创建一个 lazy 的 effect
  const effectFn = effect(getter, {
    lazy: true,
    scheduler() {
      if (!dirty) {
        dirty = true;
        trigger(obj, "value");
      }
    },
  });
  const obj = {
    // 当读取 value 的时候才执行 effectFn
    get value() {
      if (dirty) {
        value = effectFn();
        // 设置为 false 下次访问直接返回 value
        dirty = false;
      }
      track(obj, "value");
      return value;
    },
  };
  return obj;
}

/**
 * watch
 * @param {*} source 可以是一个响应式数据，也可以是一个 getter 函数
 * @param {*} cb 响应式数据变化后执行的回调函数
 */
function watch(source, cb) {
  let getter;
  //
  if (typeof source === "function") {
    getter = source;
  } else {
    getter = () => traverse(source);
  }
  let oldValue, newValue;
  const effectFn = effect(
    // 调用 traverse 递归的读取
    () => getter(),
    {
      lazy: true,
      scheduler() {
        // 在 scheduler 中执行新的副作用函数，得到的就是新值
        newValue = effectFn();
        // 当数据变化时，调用回调函数 cb
        cb(newValue, oldValue);
        // 更新一下旧值
        oldValue = newValue;
      },
    }
  );
  // 手动调用副作用函数 拿到的就是旧值
  oldValue = effectFn();
}

function traverse(value, seen = new Set()) {
  // 如果读取的是原始值 或者已经被读取过，直接返回
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  // 暂不考虑数组等其他结构
  // 使用 for in 获取对象的每一个属性 并递归的调用 traverse 进行处理
  for (let k in value) {
    traverse(value[k], seen);
  }
  return value;
}

// effect 用于注册副作用函数,这样副作用函数名字不用固定同时也可以添加匿名函数
const effect = (fn, options = {}) => {
  const effectFn = () => {
    // 调用 cleanup 函数完成清除工作,主要是为了避免副作用函数产生遗留，就是一些没有用的副作用从当前副作用函数中解绑，让当前副作用函数与没有用到的数据没有关系(p50)
    cleanup(effectFn);
    // 当 effectFn 执行的时候，将其设置为当前激活的副作用函数
    activeEffect = effectFn;
    // 在调用当前副作用函数之前将当前副作用函数压入栈
    effectStack.push(effectFn);
    const res = fn();
    // 执行完毕后将当前副作用函数弹出栈，并把activeEffect 还原为之前的值
    effectStack.pop();
    activeEffect = effectStack[effectStack.length - 1];
    return res;
  };
  // 将 options 挂载到 effectFn 上
  effectFn.options = options;
  effectFn.deps = [];
  // 只有非  lazy 的时候才会执行
  if (!options.lazy) {
    effectFn();
  }
  // 将副作用函数作为返回值返回
  return effectFn;
};

const cleanup = (effectFn) => {
  // 遍历 effectFn.deps 数组
  for (let i = 0; i < effectFn.deps; i++) {
    const deps = effectFn.deps[i];
    deps.delete(effectFn);
  }
  // 最后需要重置 effectFn.deps 数组
  effectFn.deps.length = 0;
};

// 存储副作用函数的桶
// weakMap 对 key 是弱引用，不影响垃圾回收，如果 target 对象没有引用，说明用户侧不再需要它，垃圾回收机制会完成任务
const bucket = new WeakMap();

// 原始数据
const data = { text: "hello world", bar: 2, foo: 1 };

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
  // deps 就是一个与当前副作用函数存在联系的依赖集合
  // 将其添加到 activeEffect 的 deps 数组中
  activeEffect.deps.push(deps);
}

function trigger(target, key) {
  // 根据 target 从桶里取得 depsMap
  const depsMap = bucket.get(target);
  if (!depsMap) return;
  // 根据 key 取得副作用函数并执行
  const effects = depsMap.get(key);

  // 主要是为了解决死循环，当effects 删除之后添加 就会造成死循环 通过新建一个 set，循环这个新的 set 就可以避免
  const effectsToRun = new Set();
  effects.forEach((effectFn) => {
    // 判断一下取出的副作用函数是否和当前正在执行的函数相同 相同的话就不执行了
    if (effectFn !== activeEffect) {
      effectsToRun.add(effectFn);
    }
  });
  effectsToRun.forEach((effectFn) => {
    // 如果一个副作用函数存在调度器，则调用该调度器，并将副作用函数作为参数传递
    if (effectFn.options.scheduler) {
      effectFn.options.scheduler(effectFn);
    } else {
      effectFn();
    }
  });
}

// 测试功能1 watch 接收 getter 函数
// watch(
//   () => obj.foo,
//   (newVal, oldVal) => {
//     console.log(newVal, oldVal);
//   }
// );

// 测试功能2 watch 接收一个响应式数据
watch(obj, (newVal, oldVal) => {
  console.log("数据变化了");
});

obj.foo++;
