// 向后兼容：委托给 WebFormLocator（需先加载 locator.js）
const WebFormXPath = {
  toLocator(locator) {
    return WebFormLocator.toLocator(locator);
  },

  locatorToString(locator) {
    return WebFormLocator.locatorToString(locator);
  },

  locatorToStorage(locator) {
    return WebFormLocator.locatorToStorage(locator);
  },

  getXPath(element, doc) {
    return WebFormLocator.buildLocator(element, doc);
  },

  _buildAbsoluteXPath(element) {
    return WebFormLocator._buildAbsoluteXPath(element);
  },

  _siblingSegment(element, nodeName) {
    return WebFormLocator._siblingSegment(element, nodeName);
  }
};
