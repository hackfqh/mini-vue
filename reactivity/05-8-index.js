/**
 * 5.8.3 避免污染全局数据
 *  使用 set 的时候可能给原始数据中添加了响应式数据，这种行为就是数据污染
 *    解决办法就是判断获取一下原始数据 获取不到的时候说明当前数据就是原始数据 直接设置即可
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
 * @param {*} options 可以添加 immediate 立即执行，也可以添加 flush 指定回调函数的执行时机
 */
function watch(source, cb, options = {}) {
  let getter;
  //
  if (typeof source === "function") {
    getter = source;
  } else {
    getter = () => traverse(source);
  }
  let oldValue, newValue;

  // clean 用来存储用户注册的过期回调
  let clean;
  function onInvalidate(fn) {
    // 将回调函数存储到 clean 中
    clean = fn;
  }
  const job = () => {
    // 在 scheduler 中执行新的副作用函数，得到的就是新值
    newValue = effectFn();
    // 在调用回调函数 cb 之前，先调用过期回调
    if (clean) {
      clean();
    }
    // 当数据变化时，调用回调函数 cb
    cb(newValue, oldValue, onInvalidate);
    // 更新一下旧值
    oldValue = newValue;
  };
  const effectFn = effect(
    // 调用 traverse 递归的读取
    () => getter(),
    {
      lazy: true,
      // 使用 job 函数作为调度器函数
      scheduler: () => {
        // 在调度函数中判断 flush 是否为 post 如果是 将其放到微任务队列中执行
        if (options.flush === "post") {
          const p = Promise.resolve();
          p.then(job);
        } else {
          job();
        }
      },
    }
  );
  if (options.immediate) {
    job();
  } else {
    // 手动调用副作用函数 拿到的就是旧值
    oldValue = effectFn();
  }
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
const ITERATE_KEY = Symbol();

const arrayInstrumentations = {};

["includes", "indexOf", "lastIndexOf"].forEach((method) => {
  const originMethod = Array.prototype[method];
  arrayInstrumentations[method] = function (...args) {
    // this 是代理对象，先在代理对象中查找
    let res = originMethod.apply(this, args);
    if (res === false || res === -1) {
      // 如果没有找到 通过 this.raw 拿到原始值，再去原始值里面查找同时修改 res
      res = originMethod.apply(this.raw, args);
    }
    return res;
  };
});

let shouldTrack = true;
["push", "pop", "shift", "unshift", "splice"].forEach((method) => {
  const originMethod = Array.prototype[method];
  arrayInstrumentations[method] = function (...args) {
    // 在调用原始方法之前 禁止追踪
    shouldTrack = false;
    let res = originMethod.apply(this, args);
    shouldTrack = true;
    return res;
  };
});

// 定义一个对象 将自定义的 add 方法定义到该对象下
const mutableInstrumentations = {
  add(key) {
    const target = this.raw;
    const hadKey = target.has(key);
    const res = target.add(key);
    if (!hadKey) {
      trigger(target, key, "ADD");
    }
    return res;
  },
  delete(key) {
    const target = this.raw;
    const hadKey = target.has(key);
    const res = target.delete(key);
    if (hadKey) {
      trigger(target, key, "DELETE");
    }
    return res;
  },
  get(key) {
    const target = this.raw;
    const hadKey = target.has(key);
    track(target, key);
    if (hadKey) {
      const res = target.get(key);
      return typeof res === "object" ? reactive(res) : res;
    }
  },
  set(key, value) {
    const target = this.raw;
    const hadKey = target.has(key);
    const oldValue = target.get(key);
    // 获取原始数据，由于 value 本身可能已经是原始数据，所以此时 value.raw 不存在，则直接使用 value
    const rawValue = value.raw || value;
    target.set(key, rawValue);
    // 如果不存在，则说明是 ADD 类型的操作，意味着新增
    if (!hadKey) {
      trigger(target, key, "ADD");
    } else if (
      oldValue !== value ||
      (oldValue === oldValue && value === value)
    ) {
      trigger(target, key, "SET");
    }
  },
};

/**
 * Set 和 Map 对应的方法
 * @param {*} obj 需要代理的原始数据
 * @param {*} isShallow 代表是否是浅响应
 * @param {*} isReadonly 代表数据是否是只读的
 * @returns
 */
function createReactive(obj, isShallow = false, isReadonly = false) {
  return new Proxy(obj, {
    // 拦截读取操作,接收第三个参数，代表谁在读取属性
    get(target, key, receiver) {
      // 代理对象可以通过 raw 属性访问原始数据
      if (key === "raw") {
        return target;
      }
      if (key === "size") {
        track(target, ITERATE_KEY);
        // 如果读取的是 size 属性 通过指定第三个参数 receiver 为原始对象 target 修复 set 类型代理后获取size 的问题
        return Reflect.get(target, key, target);
      }

      // 将方法与原始数据对象的target 方法绑定后返回
      return mutableInstrumentations[key];
    },
    set(target, key, newVal, receiver) {
      if (isReadonly) {
        console.warn(`属性 ${key} 是只读的`);
        return true;
      }
      // 先获取旧值
      const oldVal = target[key];
      // 如果属性不存在 说明是在添加新属性，否则就是在设置已有属性
      const type = Array.isArray(target)
        ? // 如果代理目标是数组，检测被设置的索引值是否小于数组长度
          // 如果是 就视作 SET 操作，否则就是 ADD 操作
          Number(key) < target.length
          ? "SET"
          : "ADD"
        : Object.prototype.hasOwnProperty.call(target, key)
        ? "SET"
        : "ADD";
      // 设置属性值
      const res = Reflect.set(target, key, newVal, receiver);
      // target  === receiver.raw 说明 receiver 就是 target 的代理对象
      if (target === receiver.raw) {
        // 比较新值和旧值，只有不全等,并且不都是NaN的时候才触发响应
        if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
          // 把副作用函数从桶里拿出来执行
          trigger(target, key, type, newVal);
        }
      }

      return res;
    },
    // 通过has 拦截函数实现对 in 操作符的代理 key in obj
    has(target, key) {
      track(target, key);
      return Reflect.has(target, key);
    },
    // ownKeys 拦截函数拦截 Reflect.ownKeys 操作
    ownKeys(target) {
      // 将副作用函数与 ITERATE_KEY 相关联
      // 如果操作目标 target 是数组，则使用 length 属性作为 key 并建立响应联系
      track(target, Array.isArray(target) ? "length" : ITERATE_KEY);
      return Reflect.ownKeys(target);
    },
    // deleteProperty 拦函数处理 delete 操作
    deleteProperty(target, key) {
      if (isReadonly) {
        console.warn(`属性 ${key} 是只读的`);
        return true;
      }
      // 检查被操作的属性是否是对象自己的属性
      const hadKey = Object.prototype.hasOwnProperty.call(target, key);
      const res = Reflect.deleteProperty(target, key);
      // 只有被删除的属性是对象自己的属性并且删除成功删除时，才触发更新
      if (res && hadKey) {
        trigger(target, key, "DELETE");
      }
      return res;
    },
  });
}

// 定义一个 Map 实例，存储原始对象到代理对象的映射
const reactiveMap = new Map();

// 深响应
function reactive(obj) {
  // 优先通过原始对象 obj 寻找之前创建的代理对象，如果找到了 直接返回已有的代理对象
  const existionProxy = reactiveMap.get(obj);
  if (existionProxy) return existionProxy;
  // 否则创建新的代理对象
  const proxy = createReactive(obj);
  reactiveMap.set(obj, proxy);
  return proxy;
}

// 浅响应
function shallowReactive(obj) {
  return createReactive(obj, true);
}

// 只读
function readonly(obj) {
  return createReactive(obj, false, true);
}
// 浅只读
function shallowReadonly(obj) {
  return createReactive(obj, true, true);
}

// 在 get 拦截函数内调用 track 函数追踪变化
function track(target, key) {
  if (!activeEffect || !shouldTrack) return;
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

function trigger(target, key, type, newVal) {
  // 根据 target 从桶里取得 depsMap
  const depsMap = bucket.get(target);
  if (!depsMap) return;
  // 根据 key 取得副作用函数并执行
  const effects = depsMap.get(key);
  // 取得与 ITERATE_KEY 相关联的副作用函数
  const iterateEffects = depsMap.get(ITERATE_KEY);

  // 主要是为了解决死循环，当effects 删除之后添加 就会造成死循环 通过新建一个 set，循环这个新的 set 就可以避免
  const effectsToRun = new Set();
  // 将与 key 相关联的副作用函数添加到 effectsToRun
  effects &&
    effects.forEach((effectFn) => {
      // 判断一下取出的副作用函数是否和当前正在执行的函数相同 相同的话就不执行了
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn);
      }
    });
  // 如果操作目标是数组，并且修改了数组的 length
  if (Array.isArray(target) && key === "length") {
    // 对于索引大于或等于新的 length 值得元素
    // 需要把所有相关联的副作用函数取出并添加到 effectsToRun 中待执行
    depsMap.forEach((effects, key) => {
      if (key >= newVal) {
        effects.forEach((effectFn) => {
          if (effectFn !== activeEffect) {
            effectsToRun.add(effectFn);
          }
        });
      }
    });
  }
  // 当操作类型是 ADD 并且目标对象是数组时，，应该取出并执行那些与 length 属性相关联的副作用函数
  if (type === "ADD" && Array.isArray(target)) {
    const lengthEffects = depsMap.get("length");
    lengthEffects &&
      lengthEffects.forEach((effectFn) => {
        if (effectFn !== activeEffect) {
          effectsToRun.add(effectFn);
        }
      });
  } else if (type === "ADD" || type === "DELETE") {
    // 将与 ITERATE_KEY 相关联的副作用函数也添加到 effectsToRun
    iterateEffects &&
      iterateEffects.forEach((effectFn) => {
        // 判断一下取出的副作用函数是否和当前正在执行的函数相同 相同的话就不执行了
        if (effectFn !== activeEffect) {
          effectsToRun.add(effectFn);
        }
      });
  }

  effectsToRun.forEach((effectFn) => {
    // 如果一个副作用函数存在调度器，则调用该调度器，并将副作用函数作为参数传递
    if (effectFn.options.scheduler) {
      effectFn.options.scheduler(effectFn);
    } else {
      effectFn();
    }
  });
}

// function

// 测试功能1
const s = new Set([1, 2, 3]);
const p = reactive(s);
console.log(p.size);

p.delete(1);
