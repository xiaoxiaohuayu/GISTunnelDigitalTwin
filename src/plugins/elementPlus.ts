// @env browser
import type { App, Component } from 'vue'
import {
  ElButton,
  ElCheckbox,
  ElColorPicker,
  ElConfigProvider,
  ElInput,
  ElInputNumber,
  ElOption,
  ElRadioButton,
  ElRadioGroup,
  ElSelect,
  ElSlider,
  ElSwitch,
  ElUpload,
} from 'element-plus'
import 'element-plus/es/components/base/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/checkbox/style/css'
import 'element-plus/es/components/color-picker/style/css'
import 'element-plus/es/components/config-provider/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/input-number/style/css'
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/option/style/css'
import 'element-plus/es/components/radio/style/css'
import 'element-plus/es/components/radio-button/style/css'
import 'element-plus/es/components/radio-group/style/css'
import 'element-plus/es/components/select/style/css'
import 'element-plus/es/components/slider/style/css'
import 'element-plus/es/components/switch/style/css'
import 'element-plus/es/components/upload/style/css'
import 'element-plus/theme-chalk/dark/css-vars.css'

const components: Record<string, Component> = {
  ElButton,
  ElCheckbox,
  ElColorPicker,
  ElConfigProvider,
  ElInput,
  ElInputNumber,
  ElOption,
  ElRadioButton,
  ElRadioGroup,
  ElSelect,
  ElSlider,
  ElSwitch,
  ElUpload,
}

export function registerElementPlus(app: App): void {
  for (const [name, component] of Object.entries(components)) {
    app.component(name, component)
  }
}
