/**
 * 8.1 挂载子节点和元素的属性
 *
 */

function createRenderer(options) {
  // 通过 options 得到操作 DOM 的API
  const { createElement, setElementText, insert } = options;

  /**
   * @param {*} n1 旧的 vnode
   * @param {*} n2 新的 vnode
   * @param {*} container
   */
  function patch(n1, n2, container) {
    // 如果 n1 不存在，意味着挂载，调用 mountElement 函数完成挂载
    if (!n1) {
      mountElement(n2, container);
    }
  }
  function mountElement(vnode, container) {
    // 调用 createElement 创建元素
    const el = createElement(vnode.type);
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
        // 调用 setAttribute 将属性设置到元素上
        el.setAttribute(key, vnode.props[key]);
        // 直接通过 DOM 设置，这两种方式都存在缺陷
        // el[key] = vnode.props[key]
      }
    }

    // 调用 insert 函数将元素插入到容器内
    insert(el, container);
  }
  function render(vnode, container) {
    if (vnode) {
      // 新 vnode 存在，将其与旧 vnode 一起传递给 patch 函数 进行打补丁
      patch(container._vnode, vnode, container);
    } else {
      if (container._vnode) {
        // 旧 vnode 存在 新 vnode 不存在 说明是卸载操作
        // 只需将 container 的 DOM 清空
        container.innerHTML = ""; // 有问题 暂时这么处理
      }
    }
    container._vnode = vnode;
  }
  return {
    render,
  };
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
  insert(el, parent) {
    console.log("插入元素");
    // parent.children = el;
    parent.appendChild(el);
  },
});

const vnode = {
  type: "div",
  props: {
    id: "foo",
  },
  children: [
    {
      type: "p",
      children: "hello ",
    },
  ],
};

const container = document.getElementById("app");
renderer.render(vnode, container);
