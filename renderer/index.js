/**
 * 9.6 移除不存在的元素
 *  等外层循环结束后 重新遍历下旧的子节点，同时找一个每一项是否在新的子节点中存在，如果不存在，说明是需要移除的节点
 */

// 文本节点的 type 标识
const Text = Symbol();

// 注释节点的 type 标识
const Comment = Symbol();

const Fragment = Symbol();
function createRenderer(options) {
  // 通过 options 得到操作 DOM 的API
  const {
    createElement,
    setElementText,
    insert,
    patchProps,
    createText,
    setText,
  } = options;

  /**
   * @param {*} n1 旧的 vnode
   * @param {*} n2 新的 vnode
   * @param {*} container
   */
  function patch(n1, n2, container, anchor) {
    // 如果 n1 存在则对比 n1 和 n2 的类型
    if (n1?.type !== n2.type) {
      // 如果新旧 vnode  的类型不同，则直接将旧 vnode 卸载
      unmount(n1);
      n1 = nulll;
    }
    const { type } = n2;
    if (typeof type === "string") {
      // 如果 n1 不存在，意味着挂载，调用 mountElement 函数完成挂载
      if (!n1) {
        mountElement(n2, container, anchor);
      } else {
        patchElement(n1, n2);
      }
    } else if (type === Text) {
      // 如果新的 vnode 的类型是 Text 说明该 vnode 描述的是文本节点
      // 如果没有旧节点就进行挂载
      if (!n1) {
        // 调用 options 传入的方法 createText 创建文本节点
        const el = (n2.el = createText(n2.children));
        insert(el, container);
      } else {
        const el = (n2.el = n1.el);
        if (n2.children !== n1.children) {
          // 调用 setText 更新文本内容
          setText(el, n2.children);
        }
      }
    } else if (type === Comment) {
      if (!n1) {
        // 调用方法 创建新的注释节点 在 dom 中是 document.createComment 方法
      }
    } else if (type === Fragment) {
      if (!n1) {
        // 如果旧的 vnode 不存在 则只需要将 Fragment 的 children 逐个挂载即可
        n2.children.forEach((c) => patch(null, c, container));
      } else {
        // 如果旧 vnode 存在，则只需要更新 Fragment 的 children
        patchChildren(n1, n2, container);
      }
    }
  }

  function patchElement(n1, n2) {
    const el = (n2.el = n1.el);
    const oldProps = n1.props;
    const newProps = n2.props;
    for (const key in newProps) {
      if (newProps[key] !== oldProps[key]) {
        patchProps(el, key, oldProps[key], newProps[key]);
      }
    }
    for (const key in oldProps) {
      if (!(key in newProps)) {
        patchProps(el, key, oldProps[key], null);
      }
    }

    // 第二步 更新 children
    patchChildren(n1, n2, el);
  }

  function patchChildren(n1, n2, container) {
    // 判断新子节点的类型是否是文本节点
    if (typeof n2.children === "string") {
      // 旧子节点有三种可能 没有子节点 文本子节点 以及一组子节点
      // 只有当旧子节点为一组子节点时 才需要逐步卸载，其他情况什么都不要做
      if (Array.isArray(n1.children)) {
        n1.children.forEach((c) => unmount(c));
      }
      setElementText(container, n2.children);
    } else if (Array.isArray(n2.children)) {
      // 新子节点是一组子节点
      // 判断旧子节点是否也是一组子节点
      if (Array.isArray(n1.children)) {
        const oldChildren = n1.children;
        const newChildren = n2.children;
        // const oldLen = oldChildren.length;
        // const newLen = newChildren.length;
        // // 找到新旧节点中最小的长度, 遍历调用 patch 方法
        // const commonLength = Math.min(oldLen, newLen);
        // for (let i = 0; i < commonLength; i++) {
        //   patch(oldChildren[i], newChildren[i], container);
        // }
        // // 判断新子节点的长度是否大于旧子节点的长度，如果大于，说明有新子节点需要挂载
        // if (newLen > oldLen) {
        //   for (let i = commonLength; i < newLen; i++) {
        //     patch(null, newChildren[i], container);
        //   }
        // } else if (oldLen > newLen) {
        //   // 如果旧的长度大于新的长度，说明有旧的子节点需要卸载
        //   for (let i = commonLength; i < oldLen; i++) {
        //     unmount(oldChildren[i]);
        //   }
        // }

        // 用来存储寻找过程中遇到的最大索引值
        let lastIndex = 0;
        // 遍历新的 children
        for (let i = 0; i < newChildren.length; i++) {
          const newVNode = newChildren[i];
          for (let j = 0; j < oldChildren.length; j++) {
            const oldVNode = oldChildren[j];
            // 表示当前节点是否在旧的children中
            let find = false;
            // 如果找到了具有相同 key 值的两个节点，说明可以复用，但仍然需要调用 patch 函数更新节点内容
            if (newVNode.key === oldVNode.key) {
              find = true;
              patch(oldVNode, newVNode, container);
              if (j < lastIndex) {
                // 如果找到的节点在旧 children 中索引小于最大索引值 lastIndex
                // 说明该节点对应的真实DOM需要一定
                // 找到 newVNode 的前一个 vnode
                const preVNnode = newChildren[i - 1];
                if (preVNnode) {
                  // 找到 preVNode 对应真实 DOM 的下一个兄弟节点，将其作为锚点
                  const anchor = preVNnode.el.nextSibling;
                  insert(newVNode.el, container, anchor);
                }
              } else {
                // 如果不小于，则更新lastIndex 的值
                lastIndex = j;
              }
              break;
            }
            // 内层循环之后 find 还是 false 说明没有找到
            // 因此需要挂载
            if (!find) {
              const preVNode = newChildren[i - 1];
              let anchor;
              if (preVNode) {
                // 如果有前一个 vnode，则使用他的下一个兄弟节点作为锚点
                anchor = preVNode.el.nextSibling;
              } else {
                // 如果没有前一个 vnode，说明挂载的新节点是第一个子节点
                // 这是需要使用容器中的第一个元素作为锚点
                anchor = container.firstChild;
              }
              // 挂载 newVNode
              patch(null, newVNode, container, anchor);
            }
          }
        }

        for (let i = 0; i < oldChildren; i++) {
          const oldVNode = oldChildren[i];
          // 拿旧子节点去新的子节点中找是否有相同的key
          const has = newChildren.find((vnode) => vnode.key === oldVNode.key);
          if (!has) {
            // 如果没有找到说明是需要删除的节点
            unmount(oldVNode);
          }
        }
      } else {
        // 如果不是一组子节点 说明可能是文本子节点或者不存在 这种情况下 只需要将容器清空，然后将新的一组子节点逐个挂载
        setElementText(container, "");
        n2.children.forEach((c) => patch(null, c, container));
      }
    } else {
      // 这里说明新的子节点不存在
      if (Array.isArray(n1.children)) {
        // 如果旧的子节点是一组子节点逐个卸载
        n1.children.forEach((c) => unmount(c));
      } else if (typeof n1.children === "string") {
        // 如果旧的子节点是字符串节点 则将内容清空
        setElementText(container, "");
      }
      // 如果原来就是空的就什么都不要做
    }
  }

  function mountElement(vnode, container, anchor) {
    // 调用 createElement 创建元素,同时让 vnode.el 引用真实节点
    const el = (vnode.el = createElement(vnode.type));
    if (typeof vnode.children === "string") {
      // 调用 setElementText 设置元素的文本节点
      setElementText(el, vnode.children);
    } else if (Array.isArray(vnode.children)) {
      // 如果 children 是数组，则遍历每一个子节点，并调用 patch 函数挂载它们
      vnode.children.forEach((child) => {
        patch(null, child, el);
      });
    }

    // 如果 props 存在才处理
    if (vnode.props) {
      for (const key in vnode.props) {
        // 调用 patchProps 函数
        patchProps(el, key, null, vnode.props[key]);
      }
    }

    // 调用 insert 函数将元素插入到容器内
    insert(el, container, anchor);
  }
  function render(vnode, container) {
    if (vnode) {
      // 新 vnode 存在，将其与旧 vnode 一起传递给 patch 函数 进行打补丁
      patch(container._vnode, vnode, container);
    } else {
      if (container._vnode) {
        // 调用 unmount 卸载 vnode
        unmount(container.v_node);
      }
    }
    container._vnode = vnode;
  }
  function unmount(vnode) {
    if (vnode.type === Fragment) {
      vnode.children.forEach((c) => unmount(c));
    }
    const parent = vnode.el.parentNode;
    if (parent) {
      parent.removeChild(vnode.el);
    }
  }
  return {
    render,
  };
}
function shouldSetAsProps(el, key, value) {
  if (key === "form" && el.tagName === "INPUT") return false;
  return key in el;
}
// 测试功能
const renderer = createRenderer({
  createElement(tag) {
    console.log(`创建元素${tag}`);
    return document.createElement(tag);
  },
  setElementText(el, text) {
    console.log(`设置元素的文本内容为${text}`);
    el.textContent = text;
  },
  insert(el, parent, anchor = null) {
    console.log("插入元素");
    // parent.children = el;
    parent.insertBefore(el, anchor);
  },
  createText(text) {
    return document.createTextNode(text);
  },
  setText(el, text) {
    el.nodeValue = text;
  },
  // 将属性设置相关操作封装到 patchProps 函数中，并作为渲染器选项传递
  patchProps(el, key, preValue, nextValue) {
    // 匹配以 on 开头的属性视其为事件
    if (/^on/.test(key)) {
      // 添加多个事件 所以需要保存成对象
      const invokers = el._vei || (el._vei = {});
      // 获取为该元素伪造的事件处理函数 invoker
      let invoker = invokers[key];
      const name = key.slice(2).toLowerCase();
      if (nextValue) {
        if (!invoker) {
          // 如果没有 invoker 则将一个伪造的 invoker 缓存到 el._vei 中
          invoker = el._vei[key] = (e) => {
            // e.timeStamp 是事件发生事件
            // 如果事件的发生时间早于事件处理函数绑定的时间，则不执行事件处理函数
            if (e.timeStamp < invoker.attached) return;
            // 如果 invoker.value  是数组，则遍历它并逐步调用事件处理函数,主要是处理同一个事件绑定的多个处理函数
            if (Array.isArray(invoker.value)) {
              invoker.value.forEach((fn) => fn(e));
            } else {
              invoker.value(e);
            }
          };
          // 将真正的时间处理函数赋值给 invoker.value
          invoker.value = nextValue;
          // 添加 invoker.attached 属性，存储时间处理函数被绑定的时间
          invoker.attached = performance.now();
          // 绑定 invoker 作为事件处理函数
          el.addEventListener(name, invoker);
        } else {
          // 如果 invoker 存在，意味着更新，只需要更新 invoker.value 就可以
          invoker.value = nextValue;
        }
      } else {
        // 新的事件绑定函数不存在 且之前绑定的 invoker 存在 则移除绑定
        el.removeEventListener(name, invoker);
      }
    }
    // 对 class 进行特殊处理
    if (key === "class") {
      el.className = nextValue || "";
    }
    //  使用 shouldSetAsProps 判断是否应该作为 DOM property 设置
    else if (shouldSetAsProps(el, key, nextValue)) {
      // 获取该 DOM attribute 的类型
      const type = typeof el[key];
      // 如果是布尔值并且 value 是空字符串，则将值矫正为 true
      if (type === "boolean" && nextValue === "") {
        el[key] = true;
      } else {
        el[key] = nextValue;
      }
    } else {
      // 如果要设置的属性没有对应的 DOM property ,则使用 setAttribute 设置属性
      el.setAttribute(key, nextValue);
    }
  },
});

const oldVNode = {
  type: "div",
  children: [
    { type: "p", children: "1", key: 1 },
    { type: "p", children: "2", key: 2 },
    { type: "p", children: "hello", key: 3 },
  ],
};

const newVNode = {
  type: "div",
  children: [
    { type: "p", children: "world", key: 3 },
    { type: "p", children: "1", key: 1 },
    { type: "p", children: "2", key: 2 },
  ],
};

const container = document.getElementById("app");
renderer.render(oldVNode, container);

setTimeout(() => {
  renderer.render(newVNode, container);
}, 1000);
