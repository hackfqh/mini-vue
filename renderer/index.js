/**
 * 8.3 正确的设置元素属性
 *  主要通过函数 shouldSetAsProps 先判断一个当前属性在 DOM property 上面有没有值 或者只读类型的不能直接修改比如 form 属性
 *    有的话判断一下类型是不布尔值并且值为空 如果是就将值设置为 true 否者设置为获取到的值
 *    没有的话通过 setAttribute 设置属性值
 *  为了把属性设置成与平台无关 通过 options 传入 patchProps 函数处理
 */

function createRenderer(options) {
  // 通过 options 得到操作 DOM 的API
  const { createElement, setElementText, insert, patchProps } = options;

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
        // 调用 patchProps 函数
        patchProps(el, key, null, vnode.props[key]);
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
  // 将属性设置相关操作封装到 patchProps 函数中，并作为渲染器选项传递
  patchProps(el, key, preValue, nextValue) {
    //  使用 shouldSetAsProps 判断是否应该作为 DOM property 设置
    if (shouldSetAsProps(el, key, nextValue)) {
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
