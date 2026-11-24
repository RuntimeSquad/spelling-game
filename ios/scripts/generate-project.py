#!/usr/bin/env python3
"""Deterministic Xcode project generator; no third-party tools or credentials."""
from pathlib import Path
import hashlib
root=Path(__file__).resolve().parents[1]
def uid(s): return hashlib.sha1(s.encode()).hexdigest()[:24].upper()
def q(s): return '"'+str(s).replace('"','\\"')+'"'
objects=[]
def obj(key,body):
    i=uid(key);objects.append(f'{i} = {{ {body} }};');return i
sources=sorted((root/'SpellBee/Sources').rglob('*.swift'))
resources=[root/'SpellBee/Resources/adventure.json',root/'SpellBee/Resources/PrivacyInfo.xcprivacy',root/'SpellBee/Resources/Assets.xcassets']
refs=[];builds=[];resbuilds=[]
for p in sources+resources:
    rel=str(p.relative_to(root));ft='sourcecode.swift' if p.suffix=='.swift' else 'folder.assetcatalog' if p.suffix=='.xcassets' else 'text.json' if p.suffix=='.json' else 'text.xml'
    ref=obj(rel,f'isa = PBXFileReference; lastKnownFileType = {q(ft)}; path = {q(rel)}; sourceTree = "<group>";');refs.append(ref)
    b=obj(rel+'build',f'isa = PBXBuildFile; fileRef = {ref};');(builds if p in sources else resbuilds).append(b)
testref=obj('uitestref','isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = SpellBeeUITests/SpellBeeUITests.swift; sourceTree = "<group>";');refs.append(testref)
testbuild=obj('uitestbuild',f'isa = PBXBuildFile; fileRef = {testref};')
product=obj('product','isa = PBXFileReference; explicitFileType = wrapper.application; path = "SpellBee.app"; sourceTree = BUILT_PRODUCTS_DIR;')
testproduct=obj('testproduct','isa = PBXFileReference; explicitFileType = wrapper.cfbundle; path = "SpellBeeUITests.xctest"; sourceTree = BUILT_PRODUCTS_DIR;')
products=obj('products',f'isa = PBXGroup; children = ({product},{testproduct}); name = Products; sourceTree = "<group>";')
group=obj('main',f'isa = PBXGroup; children = ({",".join(refs)},{products}); sourceTree = "<group>";')
def phase(k,kind,files): return obj(k,f'isa = {kind}; buildActionMask = 2147483647; files = ({",".join(files)}); runOnlyForDeploymentPostprocessing = 0;')
src=phase('sources','PBXSourcesBuildPhase',builds);res=phase('resources','PBXResourcesBuildPhase',resbuilds);frameworks=phase('frameworks','PBXFrameworksBuildPhase',[]);testsrc=phase('testsrc','PBXSourcesBuildPhase',[testbuild])
def configs(name,app=False,test=False):
    ids=[]
    for conf in ['Debug','Release']:
        settings={'ALWAYS_SEARCH_USER_PATHS':'NO','CLANG_ENABLE_MODULES':'YES','IPHONEOS_DEPLOYMENT_TARGET':'17.0','SDKROOT':'iphoneos','SWIFT_VERSION':'5.0','SWIFT_OPTIMIZATION_LEVEL':'-Onone' if conf=='Debug' else '-O','DEBUG_INFORMATION_FORMAT':'dwarf' if conf=='Debug' else 'dwarf-with-dsym','ENABLE_TESTABILITY':'YES' if conf=='Debug' else 'NO','SWIFT_ACTIVE_COMPILATION_CONDITIONS':'DEBUG' if conf=='Debug' else ''}
        if app or test:
            settings.update({'PRODUCT_BUNDLE_IDENTIFIER':'com.spellbee.native.preview.tests' if test else 'com.spellbee.native.preview','PRODUCT_NAME':'$(TARGET_NAME)','GENERATE_INFOPLIST_FILE':'YES','TARGETED_DEVICE_FAMILY':'1,2','CODE_SIGN_STYLE':'Automatic','CURRENT_PROJECT_VERSION':'1','MARKETING_VERSION':'0.1.0','SUPPORTED_PLATFORMS':'iphoneos iphonesimulator','SUPPORTS_MACCATALYST':'NO'})
            if app: settings.update({'INFOPLIST_FILE':'SpellBee/Resources/Info.plist','ASSETCATALOG_COMPILER_APPICON_NAME':'AppIcon','ENABLE_PREVIEWS':'YES'})
            if test: settings.update({'TEST_TARGET_NAME':'SpellBee'})
        ids.append(obj(name+conf,'isa = XCBuildConfiguration; name = '+conf+'; buildSettings = {'+''.join(f'{k} = {q(v)};' for k,v in settings.items())+'};'))
    return obj(name+'list',f'isa = XCConfigurationList; buildConfigurations = ({",".join(ids)}); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
projconfig=configs('project');appconfig=configs('app',app=True);testconfig=configs('test',test=True)
app=obj('target',f'isa = PBXNativeTarget; buildConfigurationList = {appconfig}; buildPhases = ({src},{frameworks},{res}); buildRules = (); dependencies = (); name = SpellBee; productName = SpellBee; productReference = {product}; productType = "com.apple.product-type.application";')
proxy=obj('proxy',f'isa = PBXContainerItemProxy; containerPortal = {uid("project")}; proxyType = 1; remoteGlobalIDString = {app}; remoteInfo = SpellBee;')
dep=obj('dependency',f'isa = PBXTargetDependency; target = {app}; targetProxy = {proxy};')
test=obj('testtarget',f'isa = PBXNativeTarget; buildConfigurationList = {testconfig}; buildPhases = ({testsrc}); buildRules = (); dependencies = ({dep}); name = SpellBeeUITests; productName = SpellBeeUITests; productReference = {testproduct}; productType = "com.apple.product-type.bundle.ui-testing";')
project=obj('project',f'isa = PBXProject; attributes = {{ BuildIndependentTargetsInParallel = YES; LastUpgradeCheck = 2700; TargetAttributes = {{ {app} = {{CreatedOnToolsVersion = 27.2;}}; {test} = {{CreatedOnToolsVersion = 27.2; TestTargetID = {app};}}; }}; }}; buildConfigurationList = {projconfig}; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; hasScannedForEncodings = 0; knownRegions = (en,Base); mainGroup = {group}; productRefGroup = {products}; projectDirPath = ""; projectRoot = ""; targets = ({app},{test});')
(root/'SpellBee.xcodeproj/project.pbxproj').write_text('// !$*UTF8*$!\n{archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n'+'\n'.join(objects)+'\n}; rootObject = '+project+';}\n')
ref=lambda i,name:f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{i}" BuildableName="{name}" BlueprintName="{name.split(".")[0]}" ReferencedContainer="container:SpellBee.xcodeproj"/>'
(root/'SpellBee.xcodeproj/xcshareddata/xcschemes/SpellBee.xcscheme').write_text(f'''<?xml version="1.0" encoding="UTF-8"?><Scheme LastUpgradeVersion="2700" version="1.3"><BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{ref(app,'SpellBee.app')}</BuildActionEntry></BuildActionEntries></BuildAction><TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><Testables><TestableReference skipped="NO">{ref(test,'SpellBeeUITests.xctest')}</TestableReference></Testables></TestAction><LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">{ref(app,'SpellBee.app')}</BuildableProductRunnable></LaunchAction><ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES"><BuildableProductRunnable runnableDebuggingMode="0">{ref(app,'SpellBee.app')}</BuildableProductRunnable></ProfileAction><AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/></Scheme>''')
