/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILocalizedString, miniActionTitle, miniLabel, MiniI18nTable } from '../../../../nls.js';

const browserViewLabels: MiniI18nTable<
	| 'editPage'
	| 'stopEditMode'
	| 'newTab'
	| 'contentFullscreen'
	| 'exitContentFullscreen'
	| 'htmlEditNoSelection'
	| 'htmlEditPageMode'
	| 'htmlEditText'
	| 'htmlEditHref'
	| 'htmlEditSrc'
	| 'htmlEditAlt'
	| 'htmlEditColor'
	| 'htmlEditBackground'
	| 'htmlEditBackgroundTransparent'
	| 'htmlEditFontSize'
	| 'htmlEditColorPlaceholder'
	| 'htmlEditBackgroundPlaceholder'
	| 'htmlEditPickColor'
	| 'htmlEditColorPickerConfirm'
	| 'htmlEditTabContent'
	| 'htmlEditSectionTypography'
	| 'htmlEditSectionBorder'
	| 'htmlEditSectionContainer'
	| 'htmlEditOpacity'
	| 'htmlEditFontFamily'
	| 'htmlEditFontWeight'
	| 'htmlEditLineHeight'
	| 'htmlEditLetterSpacing'
	| 'htmlEditTextAlign'
	| 'htmlEditTextStyle'
	| 'htmlEditItalic'
	| 'htmlEditUnderline'
	| 'htmlEditStrikethrough'
	| 'htmlEditTextAlignLeft'
	| 'htmlEditTextAlignCenter'
	| 'htmlEditTextAlignRight'
	| 'htmlEditTextAlignJustify'
	| 'htmlEditBorderRadius'
	| 'htmlEditBorderColor'
	| 'htmlEditBorderWidth'
	| 'htmlEditBorderStyle'
	| 'htmlEditWidth'
	| 'htmlEditHeight'
	| 'htmlEditOverflow'
	| 'htmlEditOverflowVisible'
	| 'htmlEditOverflowHidden'
	| 'htmlEditOverflowScroll'
	| 'htmlEditOverflowAuto'
	| 'htmlEditOverflowClip'
	| 'htmlEditPadding'
	| 'htmlEditMargin'
	| 'htmlEditPaddingTop'
	| 'htmlEditPaddingRight'
	| 'htmlEditPaddingBottom'
	| 'htmlEditPaddingLeft'
	| 'htmlEditMarginTop'
	| 'htmlEditMarginRight'
	| 'htmlEditMarginBottom'
	| 'htmlEditMarginLeft'
	| 'htmlEditLayoutDirection'
	| 'htmlEditDistribution'
	| 'htmlEditGap'
	| 'htmlEditAlign'
	| 'htmlEditSelectUnset'
	| 'htmlEditDistributionNormal'
	| 'htmlEditDistributionSpaceBetween'
	| 'htmlEditDistributionSpaceAround'
	| 'htmlEditFontWeightNormal'
	| 'htmlEditFontWeightBold'
	| 'htmlEditFontFamilyInherit'
	| 'htmlEditFontFamilySystemUi'
	| 'htmlEditFontFamilySansSerif'
	| 'htmlEditFontFamilySerif'
	| 'htmlEditFontFamilyMonospace'
	| 'htmlEditBorderStyleNone'
	| 'htmlEditBorderStyleSolid'
	| 'htmlEditBorderStyleDashed'
	| 'htmlEditBorderStyleDotted'
	| 'htmlEditLayoutRow'
	| 'htmlEditLayoutColumn'
	| 'htmlEditAlignStart'
	| 'htmlEditAlignCenter'
	| 'htmlEditAlignEnd'
	| 'htmlEditAlignStretch'
	| 'htmlEditSelectedHtml'
	| 'htmlEditUndo'
	| 'htmlEditRedo'
	| 'htmlEditDelete'
	| 'htmlEditSave'
	| 'htmlEditSaveNoSelection'
	| 'htmlEditSaveNoChanges'
	| 'htmlEditSaveFailed'
	| 'htmlEditSaveSuccess'
	| 'htmlEditParseFailed'
	| 'htmlEditElementNotFound'
	| 'htmlEditNestedMarkup'
	| 'htmlEditRemoveRoot'
	| 'htmlEditRemoveLast'
> = {
	editPage: { en: 'Edit Page', 'zh-cn': '\u7F16\u8F91\u9875\u9762', 'zh-Hans': '\u7F16\u8F91\u9875\u9762' },
	stopEditMode: { en: 'Stop Edit Mode', 'zh-cn': '\u505C\u6B62\u7F16\u8F91\u6A21\u5F0F', 'zh-Hans': '\u505C\u6B62\u7F16\u8F91\u6A21\u5F0F' },
	newTab: { en: 'New Tab', 'zh-cn': '\u65B0\u5EFA\u6807\u7B7E\u9875', 'zh-Hans': '\u65B0\u5EFA\u6807\u7B7E\u9875' },
	contentFullscreen: { en: 'Fullscreen', 'zh-cn': '\u5168\u5C4F', 'zh-Hans': '\u5168\u5C4F' },
	exitContentFullscreen: { en: 'Exit Fullscreen', 'zh-cn': '\u9000\u51FA\u5168\u5C4F', 'zh-Hans': '\u9000\u51FA\u5168\u5C4F' },
	htmlEditNoSelection: { en: 'No element selected', 'zh-cn': '\u672A\u9009\u4E2D\u5143\u7D20', 'zh-Hans': '\u672A\u9009\u4E2D\u5143\u7D20' },
	htmlEditPageMode: { en: 'Page', 'zh-cn': '\u9875\u9762', 'zh-Hans': '\u9875\u9762' },
	htmlEditText: { en: 'Text', 'zh-cn': '\u6587\u672C', 'zh-Hans': '\u6587\u672C' },
	htmlEditHref: { en: 'Link URL', 'zh-cn': '\u94FE\u63A5\u5730\u5740', 'zh-Hans': '\u94FE\u63A5\u5730\u5740' },
	htmlEditSrc: { en: 'Image URL', 'zh-cn': '\u56FE\u7247\u5730\u5740', 'zh-Hans': '\u56FE\u7247\u5730\u5740' },
	htmlEditAlt: { en: 'Alt text', 'zh-cn': 'Alt \u6587\u672C', 'zh-Hans': 'Alt \u6587\u672C' },
	htmlEditColor: { en: 'Color', 'zh-cn': '\u989C\u8272', 'zh-Hans': '\u989C\u8272' },
	htmlEditBackground: { en: 'Background', 'zh-cn': '\u80CC\u666F', 'zh-Hans': '\u80CC\u666F' },
	htmlEditBackgroundTransparent: { en: 'Transparent', 'zh-cn': '\u900F\u660E', 'zh-Hans': '\u900F\u660E' },
	htmlEditFontSize: { en: 'Size', 'zh-cn': '\u5927\u5C0F', 'zh-Hans': '\u5927\u5C0F' },
	htmlEditColorPlaceholder: { en: '#000000', 'zh-cn': '#000000', 'zh-Hans': '#000000' },
	htmlEditBackgroundPlaceholder: { en: 'transparent', 'zh-cn': 'transparent', 'zh-Hans': 'transparent' },
	htmlEditPickColor: { en: 'Pick color', 'zh-cn': '\u9009\u62E9\u989C\u8272', 'zh-Hans': '\u9009\u62E9\u989C\u8272' },
	htmlEditColorPickerConfirm: { en: 'OK', 'zh-cn': '\u786E\u5B9A', 'zh-Hans': '\u786E\u5B9A' },
	htmlEditTabContent: { en: 'Content', 'zh-cn': '\u5185\u5BB9', 'zh-Hans': '\u5185\u5BB9' },
	htmlEditSectionTypography: { en: 'Typography', 'zh-cn': '\u6392\u7248', 'zh-Hans': '\u6392\u7248' },
	htmlEditSectionBorder: { en: 'Border', 'zh-cn': '\u8FB9\u6846', 'zh-Hans': '\u8FB9\u6846' },
	htmlEditSectionContainer: { en: 'Container', 'zh-cn': '\u5BB9\u5668', 'zh-Hans': '\u5BB9\u5668' },
	htmlEditOpacity: { en: 'Opacity', 'zh-cn': '\u4E0D\u900F\u660E\u5EA6', 'zh-Hans': '\u4E0D\u900F\u660E\u5EA6' },
	htmlEditFontFamily: { en: 'Font', 'zh-cn': '\u5B57\u4F53', 'zh-Hans': '\u5B57\u4F53' },
	htmlEditFontWeight: { en: 'Weight', 'zh-cn': '\u5B57\u91CD', 'zh-Hans': '\u5B57\u91CD' },
	htmlEditLineHeight: { en: 'Line height', 'zh-cn': '\u884C\u9AD8', 'zh-Hans': '\u884C\u9AD8' },
	htmlEditLetterSpacing: { en: 'Tracking', 'zh-cn': '\u5B57\u8DDD', 'zh-Hans': '\u5B57\u8DDD' },
	htmlEditTextAlign: { en: 'Align', 'zh-cn': '\u5BF9\u9F50', 'zh-Hans': '\u5BF9\u9F50' },
	htmlEditTextStyle: { en: 'Style', 'zh-cn': '\u5B57\u7B26\u6837\u5F0F', 'zh-Hans': '\u5B57\u7B26\u6837\u5F0F' },
	htmlEditItalic: { en: 'Italic', 'zh-cn': '\u659C\u4F53', 'zh-Hans': '\u659C\u4F53' },
	htmlEditUnderline: { en: 'Underline', 'zh-cn': '\u4E0B\u5212\u7EBF', 'zh-Hans': '\u4E0B\u5212\u7EBF' },
	htmlEditStrikethrough: { en: 'Strikethrough', 'zh-cn': '\u5220\u9664\u7EBF', 'zh-Hans': '\u5220\u9664\u7EBF' },
	htmlEditTextAlignLeft: { en: 'Left', 'zh-cn': '\u5DE6', 'zh-Hans': '\u5DE6' },
	htmlEditTextAlignCenter: { en: 'Center', 'zh-cn': '\u5C45\u4E2D', 'zh-Hans': '\u5C45\u4E2D' },
	htmlEditTextAlignRight: { en: 'Right', 'zh-cn': '\u53F3', 'zh-Hans': '\u53F3' },
	htmlEditTextAlignJustify: { en: 'Justify', 'zh-cn': '\u4E24\u7AEF\u5BF9\u9F50', 'zh-Hans': '\u4E24\u7AEF\u5BF9\u9F50' },
	htmlEditBorderRadius: { en: 'Radius', 'zh-cn': '\u5706\u89D2', 'zh-Hans': '\u5706\u89D2' },
	htmlEditBorderColor: { en: 'Color', 'zh-cn': '\u989C\u8272', 'zh-Hans': '\u989C\u8272' },
	htmlEditBorderWidth: { en: 'Width', 'zh-cn': '\u5BBD\u5EA6', 'zh-Hans': '\u5BBD\u5EA6' },
	htmlEditBorderStyle: { en: 'Style', 'zh-cn': '\u6837\u5F0F', 'zh-Hans': '\u6837\u5F0F' },
	htmlEditWidth: { en: 'Width', 'zh-cn': '\u5BBD\u5EA6', 'zh-Hans': '\u5BBD\u5EA6' },
	htmlEditHeight: { en: 'Height', 'zh-cn': '\u9AD8\u5EA6', 'zh-Hans': '\u9AD8\u5EA6' },
	htmlEditOverflow: { en: 'Overflow', 'zh-cn': '\u6EA2\u51FA', 'zh-Hans': '\u6EA2\u51FA' },
	htmlEditOverflowVisible: { en: 'Visible', 'zh-cn': '\u53EF\u89C1', 'zh-Hans': '\u53EF\u89C1' },
	htmlEditOverflowHidden: { en: 'Hidden', 'zh-cn': '\u9690\u85CF', 'zh-Hans': '\u9690\u85CF' },
	htmlEditOverflowScroll: { en: 'Scroll', 'zh-cn': '\u6EDA\u52A8', 'zh-Hans': '\u6EDA\u52A8' },
	htmlEditOverflowAuto: { en: 'Auto', 'zh-cn': '\u81EA\u52A8', 'zh-Hans': '\u81EA\u52A8' },
	htmlEditOverflowClip: { en: 'Clip', 'zh-cn': '\u88C1\u5207', 'zh-Hans': '\u88C1\u5207' },
	htmlEditPadding: { en: 'Padding', 'zh-cn': '\u5185\u8FB9\u8DDD', 'zh-Hans': '\u5185\u8FB9\u8DDD' },
	htmlEditMargin: { en: 'Margin', 'zh-cn': '\u5916\u8FB9\u8DDD', 'zh-Hans': '\u5916\u8FB9\u8DDD' },
	htmlEditPaddingTop: { en: 'Top', 'zh-cn': '\u4E0A', 'zh-Hans': '\u4E0A' },
	htmlEditPaddingRight: { en: 'Right', 'zh-cn': '\u53F3', 'zh-Hans': '\u53F3' },
	htmlEditPaddingBottom: { en: 'Bottom', 'zh-cn': '\u4E0B', 'zh-Hans': '\u4E0B' },
	htmlEditPaddingLeft: { en: 'Left', 'zh-cn': '\u5DE6', 'zh-Hans': '\u5DE6' },
	htmlEditMarginTop: { en: 'Top', 'zh-cn': '\u4E0A', 'zh-Hans': '\u4E0A' },
	htmlEditMarginRight: { en: 'Right', 'zh-cn': '\u53F3', 'zh-Hans': '\u53F3' },
	htmlEditMarginBottom: { en: 'Bottom', 'zh-cn': '\u4E0B', 'zh-Hans': '\u4E0B' },
	htmlEditMarginLeft: { en: 'Left', 'zh-cn': '\u5DE6', 'zh-Hans': '\u5DE6' },
	htmlEditLayoutDirection: { en: 'Layout', 'zh-cn': '\u5E03\u5C40', 'zh-Hans': '\u5E03\u5C40' },
	htmlEditDistribution: { en: 'Distribution', 'zh-cn': '\u5206\u5E03', 'zh-Hans': '\u5206\u5E03' },
	htmlEditGap: { en: 'Gap', 'zh-cn': '\u95F4\u8DDD', 'zh-Hans': '\u95F4\u8DDD' },
	htmlEditAlign: { en: 'Align', 'zh-cn': '\u5BF9\u9F50', 'zh-Hans': '\u5BF9\u9F50' },
	htmlEditSelectUnset: { en: '\u2014', 'zh-cn': '\u2014', 'zh-Hans': '\u2014' },
	htmlEditDistributionNormal: { en: 'Normal', 'zh-cn': '\u6B63\u5E38', 'zh-Hans': '\u6B63\u5E38' },
	htmlEditDistributionSpaceBetween: { en: 'Space between', 'zh-cn': '\u4E24\u7AEF\u5BF9\u9F50', 'zh-Hans': '\u4E24\u7AEF\u5BF9\u9F50' },
	htmlEditDistributionSpaceAround: { en: 'Space around', 'zh-cn': '\u73AF\u7ED5\u5206\u5E03', 'zh-Hans': '\u73AF\u7ED5\u5206\u5E03' },
	htmlEditFontWeightNormal: { en: 'Normal', 'zh-cn': '\u6B63\u5E38', 'zh-Hans': '\u6B63\u5E38' },
	htmlEditFontWeightBold: { en: 'Bold', 'zh-cn': '\u7C97\u4F53', 'zh-Hans': '\u7C97\u4F53' },
	htmlEditFontFamilyInherit: { en: 'Inherit', 'zh-cn': '\u7EE7\u627F', 'zh-Hans': '\u7EE7\u627F' },
	htmlEditFontFamilySystemUi: { en: 'System UI', 'zh-cn': '\u7CFB\u7EDF UI', 'zh-Hans': '\u7CFB\u7EDF UI' },
	htmlEditFontFamilySansSerif: { en: 'Sans-serif', 'zh-cn': '\u65E0\u886C\u7EBF', 'zh-Hans': '\u65E0\u886C\u7EBF' },
	htmlEditFontFamilySerif: { en: 'Serif', 'zh-cn': '\u886C\u7EBF', 'zh-Hans': '\u886C\u7EBF' },
	htmlEditFontFamilyMonospace: { en: 'Monospace', 'zh-cn': '\u7B49\u5BBD', 'zh-Hans': '\u7B49\u5BBD' },
	htmlEditBorderStyleNone: { en: 'None', 'zh-cn': '\u65E0', 'zh-Hans': '\u65E0' },
	htmlEditBorderStyleSolid: { en: 'Solid', 'zh-cn': '\u5B9E\u7EBF', 'zh-Hans': '\u5B9E\u7EBF' },
	htmlEditBorderStyleDashed: { en: 'Dashed', 'zh-cn': '\u865A\u7EBF', 'zh-Hans': '\u865A\u7EBF' },
	htmlEditBorderStyleDotted: { en: 'Dotted', 'zh-cn': '\u70B9\u7EBF', 'zh-Hans': '\u70B9\u7EBF' },
	htmlEditLayoutRow: { en: 'Horizontal', 'zh-cn': '\u6C34\u5E73', 'zh-Hans': '\u6C34\u5E73' },
	htmlEditLayoutColumn: { en: 'Vertical', 'zh-cn': '\u5782\u76F4', 'zh-Hans': '\u5782\u76F4' },
	htmlEditAlignStart: { en: 'Start', 'zh-cn': 'start', 'zh-Hans': 'start' },
	htmlEditAlignCenter: { en: 'Center', 'zh-cn': 'center', 'zh-Hans': 'center' },
	htmlEditAlignEnd: { en: 'End', 'zh-cn': 'end', 'zh-Hans': 'end' },
	htmlEditAlignStretch: { en: 'Stretch', 'zh-cn': 'stretch', 'zh-Hans': 'stretch' },
	htmlEditSelectedHtml: { en: 'Selected HTML', 'zh-cn': '\u9009\u4E2D\u5143\u7D20 HTML', 'zh-Hans': '\u9009\u4E2D\u5143\u7D20 HTML' },
	htmlEditUndo: { en: 'Undo', 'zh-cn': '\u64A4\u9500', 'zh-Hans': '\u64A4\u9500' },
	htmlEditRedo: { en: 'Redo', 'zh-cn': '\u91CD\u505A', 'zh-Hans': '\u91CD\u505A' },
	htmlEditDelete: { en: 'Delete element', 'zh-cn': '\u5220\u9664\u5143\u7D20', 'zh-Hans': '\u5220\u9664\u5143\u7D20' },
	htmlEditSave: { en: 'Save to File', 'zh-cn': '\u4FDD\u5B58\u5230\u6587\u4EF6', 'zh-Hans': '\u4FDD\u5B58\u5230\u6587\u4EF6' },
	htmlEditSaveNoSelection: { en: 'Select an element before saving.', 'zh-cn': '\u4FDD\u5B58\u524D\u8BF7\u5148\u9009\u62E9\u4E00\u4E2A\u5143\u7D20\u3002', 'zh-Hans': '\u4FDD\u5B58\u524D\u8BF7\u5148\u9009\u62E9\u4E00\u4E2A\u5143\u7D20\u3002' },
	htmlEditSaveNoChanges: { en: 'No changes to save.', 'zh-cn': '\u6CA1\u6709\u53EF\u4FDD\u5B58\u7684\u66F4\u6539\u3002', 'zh-Hans': '\u6CA1\u6709\u53EF\u4FDD\u5B58\u7684\u66F4\u6539\u3002' },
	htmlEditSaveFailed: { en: 'Could not apply the edit.', 'zh-cn': '\u65E0\u6CD5\u5E94\u7528\u7F16\u8F91\u3002', 'zh-Hans': '\u65E0\u6CD5\u5E94\u7528\u7F16\u8F91\u3002' },
	htmlEditSaveSuccess: { en: 'Saved successfully', 'zh-cn': '\u4FDD\u5B58\u6210\u529F', 'zh-Hans': '\u4FDD\u5B58\u6210\u529F' },
	htmlEditParseFailed: { en: 'Could not parse HTML source.', 'zh-cn': '\u65E0\u6CD5\u89E3\u6790 HTML \u6E90\u6587\u4EF6\u3002', 'zh-Hans': '\u65E0\u6CD5\u89E3\u6790 HTML \u6E90\u6587\u4EF6\u3002' },
	htmlEditElementNotFound: { en: 'Selected element was not found in the HTML source.', 'zh-cn': '\u5728 HTML \u6E90\u6587\u4EF6\u4E2D\u627E\u4E0D\u5230\u6240\u9009\u5143\u7D20\u3002', 'zh-Hans': '\u5728 HTML \u6E90\u6587\u4EF6\u4E2D\u627E\u4E0D\u5230\u6240\u9009\u5143\u7D20\u3002' },
	htmlEditNestedMarkup: { en: 'This element contains nested markup. Edit its text in the HTML source instead.', 'zh-cn': '\u8BE5\u5143\u7D20\u5305\u542B\u5D4C\u5957\u6807\u8BB0\u3002\u8BF7\u5728 HTML \u6E90\u6587\u4EF6\u4E2D\u7F16\u8F91\u5176\u6587\u672C\u3002', 'zh-Hans': '\u8BE5\u5143\u7D20\u5305\u542B\u5D4C\u5957\u6807\u8BB0\u3002\u8BF7\u5728 HTML \u6E90\u6587\u4EF6\u4E2D\u7F16\u8F91\u5176\u6587\u672C\u3002' },
	htmlEditRemoveRoot: { en: 'Cannot remove the root element.', 'zh-cn': '\u65E0\u6CD5\u5220\u9664\u6839\u5143\u7D20\u3002', 'zh-Hans': '\u65E0\u6CD5\u5220\u9664\u6839\u5143\u7D20\u3002' },
	htmlEditRemoveLast: { en: 'Cannot remove the last rendered element in the document.', 'zh-cn': '\u65E0\u6CD5\u5220\u9664\u6587\u6863\u4E2D\u6700\u540E\u4E00\u4E2A\u53EF\u6E32\u67D3\u5143\u7D20\u3002', 'zh-Hans': '\u65E0\u6CD5\u5220\u9664\u6587\u6863\u4E2D\u6700\u540E\u4E00\u4E2A\u53EF\u6E32\u67D3\u5143\u7D20\u3002' },
};

type BrowserViewLabelKey = keyof typeof browserViewLabels;

export function browserViewLabel(key: BrowserViewLabelKey, fallback: string): string {
	return miniLabel(browserViewLabels, key, fallback);
}

export function browserViewActionTitle(key: BrowserViewLabelKey, fallback: string): ILocalizedString {
	return miniActionTitle(browserViewLabels, key, fallback);
}
