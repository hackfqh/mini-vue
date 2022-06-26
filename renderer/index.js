/**
 * 7.2 渲染器的基本概念
 */

function createRenderer() {
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

const { effect, ref } = VueReactivity;

function renderer(domString, container) {
  container.innerHTML = domString;
}

const count = ref(1);

effect(() => {
  renderer(`<h1>${count.value}</h1>`, document.getElementById("app"));
});

count.value++;
