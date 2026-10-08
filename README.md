# MATLAB 矩阵工作台

本地运行的 MATLAB 编程辅助工具

使用原生 HTML、CSS、JavaScript 和 Canvas，无需安装 npm 依赖或 MATLAB。代码复制到 MATLAB 中执行；预览在浏览器中进行受限的数值计算。

## 启动

需要 Python 3 和现代浏览器。在工作区执行：

```sh
cd matlab_helper
python3 -m http.server 8765 --bind 127.0.0.1
```

访问 [http://localhost:8765](http://localhost:8765)。已位于项目目录时省略 cd；终端按 Ctrl+C 停止服务。端口被占用时更换端口和访问地址。

也可直接打开 index.html，但浏览器可能限制自动复制。


## 限制

- 不连接 MATLAB，不执行完整 MATLAB 代码，也不保证所有输入公式返回合法标量。
- 矩阵读取不支持冒号展开、嵌套矩阵、字符串、注释、单引号转置以及 zeros/rand 等矩阵生成函数。
- 预览支持数值、pi、符号赋值、向量索引、加减乘除乘方及 sin/cos/tan/sind/cosd/tand/sqrt/abs，不执行任意 JavaScript。
- 预览支持显式矩阵、工具生成的旋转变量拼接和矩阵变量连乘，不支持所有 MATLAB 表达式。
- 尚未实现四元数、逆运动学、碰撞检测和数据持久化。



## 开发检查

需要 Node.js，在项目目录执行：

```sh
node arm-preview.test.js
```

覆盖表达式解析、符号识别、连乘、非法矩阵、循环引用和 ABB 示例末端位置，不替代浏览器交互验证。
