//#region global variables
const storage = browser.storage.local;

const defaultWindows =
{
    "template":
    {
        init: false,
        id: browser.windows.WINDOW_ID_NONE,
        currentGroup: "1",
        tabGroups:
        {
            "1":
            {
                name: "Default",
                muted: false,
                active: browser.tabs.TAB_ID_NONE,
                noDiscard: false,
                tabs: [],
                audibleTabs: [],
            }
        }
    }
}

var windows;

var windowIds = {};

var windowSessionInfo = 
{
    "currentGroup": "string",
    "groupInfo":
    {
        "id": "name"
    }
}

var defaultState = 
{ 
    currentWindow: ""
};

var state;

const defaultSettings =
{
    init: false,
    debug: false,
    autoClosePopup: false,
    discardWhenHidden: false,
    muteWhenHidden: false,
    showAdvancedButtons: false,
    showDiscardButton: false,
    showResetButton: false,
}

var settings;

var gClient;

const sessionKeys = 
{
    windowId: "windowId",
    windowInfo: "windowSessionInfo",
    tabGroupId: "groupId",
    tabActive: "active"
}

function Clone( obj )
{
    return JSON.parse(JSON.stringify(obj));
}

function dlog( ...args )
{
    if( settings.debug )
    {
        console.log( 'dlog', Clone( args ) );
    }
}
//#endregion

window.onload = async function()
{
    //#region functions
    function ResetAll()
    {
        return new Promise( async ( resolve, reject ) => { 
            try
            {
                browser.tabs.onActivated.removeListener( TabActivated );
    
                let allWindows = await browser.windows.getAll();
                
                for( let window of allWindows )
                {
                    await browser.sessions.removeWindowValue( window.id, sessionKeys.windowId );
        
                    await browser.sessions.removeWindowValue( window.id, sessionKeys.windowInfo );
        
                    let tabs = await browser.tabs.query( { windowId: window.id } );
        
                    for( let tab of tabs )
                    {
                        await browser.sessions.removeTabValue( tab.id, sessionKeys.tabGroupId );
        
                        await browser.sessions.removeTabValue( tab.id, sessionKeys.tabActive );
        
                        await browser.tabs.show( tab.id );
                    }
                }
        
                await storage.clear();
        
                browser.tabs.onActivated.addListener( TabActivated );
        
                await Initialize();

                resolve( true );
            }
            catch( e )
            {
                reject( e );
            }
        } );
    }

    function SyncProperty( original, syncTo )
    {
        let updated = false;

        for( let prop in original )
        {
            if( !syncTo.hasOwnProperty( prop ) )
            {
                syncTo[prop] = original[prop];

                updated = true;
            }
        }

        for( let prop in syncTo )
        {
            if( !original.hasOwnProperty( prop ) )
            {
                delete syncTo[prop];

                updated = true;
            }
        }

        return updated;
    }

    function GetNewWindowId()
    {
        try
        {
            let keys = Object.keys( windows );

            let lastKey = Number( keys[ keys.length - 1] );
    
            if( isNaN( lastKey ) )
            {
                throw `GetNewWindowId: lastKey is NaN. windows: ${JSON.stringify( windows )}`;
            }
    
            return lastKey + 1;
        }
        catch( e )
        {
            throw( e );
        }
    }

    function GetNewGroupId( windowId = "" )
    {
        try
        {
            let keys = Object.keys( windows[windowId].tabGroups );

            let lastKey = Number( keys[ keys.length - 1] );
    
            if( isNaN( lastKey ) )
            {
                throw `GetNewGroupId: lastKey is NaN. windowId:${windowId} windows:${JSON.stringify( windows )}`;
            }
    
            return lastKey + 1;
        }
        catch( e )
        {
            throw e;
        }
    }

    function SetWindowSessionInfo( windowId = -1, tabGroups = new Object() )
    {
        return new Promise( async ( resolve, reject ) => {
            try
            {
                let currentGroup = windows[windowIds[windowId]].currentGroup;

                windowSessionInfo = {};

                windowSessionInfo["currentGroup"] = currentGroup;

                windowSessionInfo["groupInfo"] = {};

                for( let groupProp in tabGroups )
                {
                    windowSessionInfo["groupInfo"][groupProp] = tabGroups[groupProp].name;
                }
        
                await browser.sessions.setWindowValue( windowId, sessionKeys.windowInfo, windowSessionInfo );

                resolve( true );
            }
            catch( e )
            {
                reject( e );
            }
        } );
    }

    function AddTabToGroup( windowId = "", groupId = "", tab = new Object() )
    {
        return new Promise( async ( resolve, reject ) => {
            try
            {                
                windows[windowId].tabGroups[groupId].tabs.push( tab.id );

                if( tab.audible && tab.width != 0 && tab.height != 0 )
                {
                    windows[windowId].tabGroups[groupId].audibleTabs.push( tab.id );
                }
        
                await browser.sessions.setTabValue( tab.id, sessionKeys.tabGroupId, groupId );
    
                resolve( true );
            }
            catch( e )
            {
                reject( e );
            }
        } );
        
    }

    function RemoveTabFromGroup( windowId = "", groupId = "", tabId = -1 )
    {
        return new Promise( async ( resolve, reject ) => { 
            try
            {
                if( windows[windowId].tabGroups[groupId].active == tabId )
                {
                    windows[windowId].tabGroups[groupId].active = browser.tabs.TAB_ID_NONE;
                }
        
                let idx = windows[windowId].tabGroups[groupId].tabs.indexOf( tabId );
        
                let aidx = windows[windowId].tabGroups[groupId].audibleTabs.indexOf( tabId );
        
                if( idx == -1 )
                {
                    throw `RemoveTabFromGroup : idx is null. windows[${windowId}].tabGroups[${groupId}].tabs.indexOf( ${tabId} )`;
                }
        
                windows[windowId].tabGroups[groupId].tabs.splice( idx, 1 );
        
                if( aidx != -1 )
                {
                    windows[windowId].tabGroups[groupId].audibleTabs.splice( aidx, 1 );
                }
        
                if( windows[windowId].tabGroups[groupId].tabs.length == 0 )
                {
                    await browser.tabs.create( { active:true, windowId:windows[windowId].id } );
                }

                resolve( true );
            }
            catch( e )
            {
                reject( e );
            }
        } );
    }

    function Initialize( )
    {
        return new Promise( async ( resolve, reject ) => {
            try
            {
                settings = Clone( defaultSettings );
    
                settings.init = true;
        
                await storage.set( { settings } );
        
                let allWindows = await browser.windows.getAll();
        
                let windowId = 1;
        
                windows = {};
        
                for( let window of allWindows )
                {
                    let wid = windowId.toString();
        
                    await browser.sessions.setWindowValue( window.id, sessionKeys.windowId, wid );
        
                    windows[wid] = Clone( defaultWindows["template"] );
        
                    windows[wid].id = window.id;
        
                    windowIds[window.id.toString()] = wid;
        
                    let tabs = await browser.tabs.query( { windowId : window.id } );
        
                    for( let tab of tabs )
                    {
                        if( tab.active )
                        {
                            windows[wid].tabGroups["1"].active = tab.id;
        
                            await browser.sessions.setTabValue( tab.id, sessionKeys.tabActive, "1" );
                        }
        
                        await AddTabToGroup( wid, "1", tab );
        
                        await browser.sessions.setTabValue( tab.id, sessionKeys.tabGroupId, "1" );
                    }
        
                    windows[wid].init = true;
        
                    await SetWindowSessionInfo( window.id, windows[wid].tabGroups );
        
                    windowId++;
                }
        
                await storage.set( { windows } );
        
                state = Clone( defaultState );
        
                let cWindow = await browser.windows.getCurrent();
        
                state.currentWindow = await browser.sessions.getWindowValue( cWindow.id, sessionKeys.windowId );
        
                await storage.set( { state } );
        
                await RecreateMenus( );
    
                resolve( true );
            }
            catch( e )
            {
                reject( e );
            }
        } );
    }

    function Load( lSettings = new Object() )
    {
        return new Promise( async ( resolve, reject ) => {

            try
            {
                settings = lSettings;

                //update settings property
                if( SyncProperty( defaultSettings, settings ) )
                {
                    dlog( "settings is updated" );
                    await storage.set( { settings } );
                }
    
                //restore windows obj, update windows property
                let data = await storage.get( "windows" );
        
                windows = data.windows;
        
                let windowsUpdated = false;

                for( let window in windows )
                {
                    windows[window].init = false;

                    windowsUpdated = SyncProperty( defaultWindows["template"], windows[window] );
                }
        
                //restore tabids, reset audibleTabs, update tabGroups property
                let allWindows = await browser.windows.getAll();

                let tabGroupUpdated = false;
        
                for( let window of allWindows )
                {
                    let windowId = await browser.sessions.getWindowValue( window.id, sessionKeys.windowId );
        
                    windows[windowId].id = window.id;
        
                    windowIds[window.id.toString()] = windowId;
        
                    let tabs = await browser.tabs.query( { windowId:window.id } );
        
                    for( let tabGroup in windows[windowId].tabGroups )
                    {
                        windows[windowId].tabGroups[tabGroup].tabs = [];
        
                        windows[windowId].tabGroups[tabGroup].audibleTabs = [];
        
                        windows[windowId].tabGroups[tabGroup].muted = false;

                        tabGroupUpdated = SyncProperty( defaultWindows["template"].tabGroups["1"], windows[windowId].tabGroups[tabGroup] );
                    }
        
                    for( let tab of tabs )
                    {
                        let groupId = await browser.sessions.getTabValue( tab.id, sessionKeys.tabGroupId );
        
                        if( groupId == undefined ) 
                        { 
                            throw ["groupId is undefined", tab, windowId, groupId ]; 
                        }

                        await AddTabToGroup( windowId, groupId, tab );
        
                        if( windows[windowId].currentGroup != groupId )
                        {
                            await browser.tabs.hide( tab.id );
                        }
        
                        let active = await browser.sessions.getTabValue( tab.id, sessionKeys.tabActive );
        
                        if( active != undefined )
                        {
                            windows[windowId].tabGroups[groupId].active = tab.id;
                        }
                    }
        
                    windows[windowId].init = true;
                }

                //save if updated
                if( windowsUpdated || tabGroupUpdated )
                {
                    dlog( "windows is updated" );
                    await storage.set( { windows } );
                }
        
                //restore state
                data = await storage.get( "state" );
        
                state = data.state;
        
                let cWindow = await browser.windows.getCurrent();
        
                state.currentWindow = await browser.sessions.getWindowValue( cWindow.id, sessionKeys.windowId );
        
                await storage.set( { state } );
        
                //create menus
                await RecreateMenus( );
    
                resolve( true );
            }
            catch( e )
            {
                reject( e );
            }
        } );
    }

    function RecreateMenus( )
    {
        return new Promise( async ( resolve, reject ) => {
            try
            {
                await browser.menus.removeAll();
    
                let parentId = "stg_menuParent";
                
                await browser.menus.create( {
                    id: parentId,
                    title: "Move to",
                    contexts: ["tab", "page"]
                } );
    
                windowsKeys = Object.keys( windows );
    
                if( windowsKeys.length == 1 )
                {
                    let wid = windowsKeys[0];
                    let tabGroupsKeys = Object.keys( windows[wid].tabGroups );
    
                    for( let gid of tabGroupsKeys )
                    {
                        await browser.menus.create( { parentId: parentId, id: `stg_menu${wid}_${gid}`, title: windows[wid].tabGroups[gid].name, contexts: ["tab", "page"] } );
                    }
                }
                else
                {
                    for( let wid of windowsKeys )
                    {
                        let windowMenuId = `stg_menuWindow${wid}`;

                        await browser.menus.create( { parentId: parentId, id:windowMenuId, title: `Window ${wid}`, contexts: ["tab", "page"] } )
                        
                        let tabGroupsKeys = Object.keys( windows[wid].tabGroups );
    
                        for( let gid of tabGroupsKeys )
                        {
                            browser.menus.create( { parentId: windowMenuId, id: `stg_menu${wid}_${gid}`, title: windows[wid].tabGroups[gid].name, contexts: ["tab", "page"] } );
                        }
                    }
                }
    
                browser.menus.onClicked.addListener( MenuOnClicked );

                resolve( true );
            }
            catch( e )
            {
                reject( e );
            }
        } );
    }

    function SetCurrentGroup( targetGroupId  = "" )
    {
        return new Promise( async ( resolve, reject ) => {
            try
            {
                let windowId = state.currentWindow;

                if( windows[windowId].tabGroups[targetGroupId] == undefined )
                {
                    throw `windows[${windowId}].tabGroups[${targetGroupId}] is undefined. windows:${JSON.stringify( windows )}`;

                    return;
                }

                let oldGroupId = windows[windowId].currentGroup;

                windows[windowId].currentGroup = targetGroupId;

                await storage.set( { windows } );

                //show tabs, set active tab
                await browser.tabs.show( windows[windowId].tabGroups[targetGroupId].tabs );

                if( windows[windowId].tabGroups[targetGroupId].active == browser.tabs.TAB_ID_NONE )
                {
                    await browser.tabs.update( windows[windowId].tabGroups[targetGroupId].tabs[0], { active:true } );
                }
                else
                {
                    await browser.tabs.update( windows[windowId].tabGroups[targetGroupId].active, { active:true } );
                }

                //unmute
                if( windows[windowId].tabGroups[targetGroupId].muted )
                {
                    for( let atab of windows[windowId].tabGroups[targetGroupId].audibleTabs )
                    {
                        await browser.tabs.update( atab, { muted:false } );
                    }

                    windows[windowId].tabGroups[targetGroupId].muted = false;
                }

                await browser.tabs.hide( windows[windowId].tabGroups[oldGroupId].tabs );

                await SetWindowSessionInfo( windows[windowId].id, windows[windowId].tabGroups );

                //discard tabs
                if( settings.discardWhenHidden && !windows[windowId].tabGroups[oldGroupId].noDiscard )
                {
                    await browser.tabs.discard( windows[windowId].tabGroups[oldGroupId].tabs );

                    windows[windowId].tabGroups[oldGroupId].audibleTabs = [];

                    windows[windowId].tabGroups[oldGroupId].muted = false;
                }
                //mute tabs
                else if( settings.muteWhenHidden )
                {
                    for( let tabid of windows[windowId].tabGroups[oldGroupId].audibleTabs )
                    {
                        await browser.tabs.update( tabid, { muted:true } );
                    }

                    if( windows[windowId].tabGroups[oldGroupId].audibleTabs.length != 0 )
                    {
                        windows[windowId].tabGroups[oldGroupId].muted = true;
                    }

                    for( let tabid of windows[windowId].tabGroups[targetGroupId].tabs )
                    {
                        await browser.tabs.update( tabid, { muted:false } );
                    }
                }

                resolve( true );
            }
            catch( e )
            {
                reject( e );
            }
        } );
    }

    //event listner functions
    async function MenuOnClicked( info, tab )
    {
        try
        {
            dlog( `MenuOnClicked`, info, tab );

            if( tab.pinned )
            {
                dlog( `MenuOnClicked : can not move pinned tab.`);

                return;
            }

            let currentWindowId = state.currentWindow;

            let currentGroupId = windows[currentWindowId].currentGroup;

            let windowIdFrom = windowIds[tab.windowId];
    
            let groupFrom = windows[windowIdFrom].currentGroup;
    
            let tmp = info.menuItemId.substring( "stg_menu".length ).split( '_' );
    
            let windowIdTo = tmp[0];
    
            let groupTo = tmp[1];
    
            if( windowIdFrom == windowIdTo && groupFrom == groupTo )
            {
                return;
            }

            let groupIdx = windows[windowIdFrom].tabGroups[groupFrom].tabs.indexOf( tab.id );

            let audibleIdx = windows[windowIdFrom].tabGroups[groupFrom].audibleTabs.indexOf( tab.id );

            if( groupIdx == -1 )
            {
                throw `MenuOnClicked : groupIdx is -1, windowIdFrom: ${windowIdFrom}, groupFrom: ${groupFrom}, tabId: ${tab.id}, windows:${JSON.stringify( windows )}`;
            }

            if( tab.active )
            {
                if( windows[windowIdFrom].tabGroups[groupFrom].tabs.length == 1 )
                {
                    let newTab = await browser.tabs.create( { windowId:windows[windowIdFrom].id, active:true } );
                }
                else
                {
                    let nextActiveTab = groupIdx + 1;

                    if( nextActiveTab >= windows[windowIdFrom].tabGroups[groupFrom].tabs.length )
                    {
                        nextActiveTab = groupIdx - 1;
                    }

                    await browser.tabs.update( windows[windowIdFrom].tabGroups[groupFrom].tabs[nextActiveTab], { active:true } );
                }
            }

            windows[windowIdFrom].tabGroups[groupFrom].tabs.splice( groupIdx, 1 );

            windows[windowIdTo].tabGroups[groupTo].tabs.push( tab.id );

            if( audibleIdx != -1 )
            {
                windows[windowIdFrom].tabGroups[groupFrom].audibleTabs.splice( audibleIdx, 1 );

                windows[windowIdTo].tabGroups[groupTo].audibleTabs.push( tab.id );
            }

            //move tab between different windows
            if( windowIdFrom != windowIdTo )
            {
                browser.tabs.onDetached.removeListener( TabDetached );

                browser.tabs.onAttached.removeListener( TabAttached );

                await browser.tabs.move( tab.id, { windowId:windows[windowIdTo].id, index:-1 } );

                browser.tabs.onDetached.addListener( TabDetached );

                browser.tabs.onAttached.addListener( TabAttached );

                await browser.sessions.setTabValue( tab.id, sessionKeys.tabGroupId, groupTo );

                if( windows[windowIdTo].currentGroup != groupTo )
                {
                    browser.tabs.hide( tab.id );
                }
            }
            //just hide tab
            else
            {
                await browser.sessions.setTabValue( tab.id, sessionKeys.tabGroupId, groupTo );

                await browser.tabs.hide( tab.id );
            }

            //discard tab
            if( windows[windowIdTo].currentGroup != groupTo && settings.discardWhenHidden && !windows[windowIdTo].tabGroups[groupTo].noDiscard )
            {
                dlog( `discard tab` );

                await browser.tabs.discard( tab.id );
            }
            
            await storage.set( { windows } );
        }
        catch( e )
        {
            console.error( e );
        }
    }

    async function TabRemoved( tabId, info )
    {
        try
        {
            dlog( 'TabRemoved', tabId, info );

            if( info.isWindowClosing )
            {
                return;
            }

            let wid = windowIds[info.windowId.toString()];
    
            await RemoveTabFromGroup( wid, windows[wid].currentGroup, tabId );
    
            await storage.set( { windows } );
        }
        catch( e )
        {
            console.error( e );
        }
    }

    async function TabDetached( tabId, info )
    {
        try
        {
            dlog( 'TabDetached', tabId, info );

            let wid = windowIds[info.oldWindowId];

            if( wid == undefined )
            {
                throw `TabDatached : wid is undefined. windowId:${info.oldWindowId}, windows:${JSON.stringify( windows )}`;
            }

            let count = 0;
            
            for( let prop in windows[wid].tabGroups )
            {
                count += windows[wid].tabGroups[prop].tabs.length;
                if( count > 1 )
                {
                    break;
                }
            }

            if( count == 1 )
            {
                dlog( `TabDetached : aborted. ( window is closing )` );

                return;
            }

            await RemoveTabFromGroup( wid, windows[wid].currentGroup, tabId );

            await storage.set( { windows } );
        }
        catch( e )
        {
            console.error( e );
        }
    }

    async function TabAttached( tabId, info )
    {
        try
        {
            dlog( 'TabAttached', tabId, info );

            let wid = windowIds[info.newWindowId];

            if( !windows[wid].init )
            {
                dlog( `TabAttached : aborted` );

                return;
            }

            let tab = await browser.tabs.get( tabId );

            let actualTabId = tab.id;

            let gid = windows[wid].currentGroup;

            //HACK: this happens when detach and attach the same tab between windows. and it causes bugs. i don't know how to fix these bugs, so duplicate tab and remove original for now. 
            if( tabId != actualTabId )
            {
                dlog( `TabAttached : missmatch ${tabId}, ${actualTabId}` );

                let duplicatedTab = await browser.tabs.duplicate( tabId );

                //about:* urls refuse setTabValue in OnCreate. i don't why.
                await browser.sessions.setTabValue( duplicatedTab.id, sessionKeys.tabGroupId, gid );

                browser.tabs.onRemoved.removeListener( TabRemoved );

                await browser.tabs.remove( tabId );

                browser.tabs.onRemoved.addListener( TabRemoved );
            }
            else
            {
                await AddTabToGroup( wid, gid, tab );
            }

            await storage.set( { windows } );
        }
        catch( e )
        {
            console.error( e );
        }
    }

    async function TabCreated( tab )
    {
        try
        {
            dlog( 'TabCreated', tab );

            let windowId = windowIds[tab.windowId.toString()];

            if( windowId == undefined || !windows[windowId].init)
            {
                dlog( `TabCreate : aborted` );

                return;
            }

            await AddTabToGroup( windowId, windows[windowId].currentGroup, tab );
            
            await storage.set( { windows } );
        }
        catch( e )
        {
            console.error( e );
        }
    }

    async function TabActivated( info ) //info = { tabId, windowId }
    {
        try
        {
            dlog( 'TabActivated', info );

            let wid = windowIds[info.windowId.toString()];

            if( windows[wid] == undefined || !windows[wid].init )
            {
                dlog( `TabActivated : aborted. window is creating.` );

                return;
            }

            let gid = await browser.sessions.getTabValue( info.tabId, sessionKeys.tabGroupId );

            //happens when attaching/detaching tab
            if( gid == undefined )
            {
                let idx = -1;

                idx = windows[wid].tabGroups[windows[wid].currentGroup].tabs.indexOf( info.tabId );

                if( idx == -1 )
                {
                    dlog( `TabActivated : aborted.` );

                    return;
                }
                //attaching tab
                else
                {
                    dlog( `TabActivated : get gid from idx.` );
                    gid = windows[wid].currentGroup;
                }
            }

            //unwanted auto showed tab
            if( windows[wid].currentGroup != gid )
            {
                dlog( `TabActivated : hiding unwanted tab. gid:${gid}` );

                await browser.tabs.hide( info.tabId );

                return;
            }

            if( windows[wid].tabGroups[gid].active == browser.tabs.TAB_ID_NONE )
            {
                await browser.sessions.setTabValue( info.tabId, sessionKeys.tabActive, "1" );
            }
            else if( windows[wid].tabGroups[gid].active != info.tabId )
            {
                await browser.sessions.removeTabValue( windows[wid].tabGroups[gid].active, sessionKeys.tabActive );

                await browser.sessions.setTabValue( info.tabId, sessionKeys.tabActive, "1" );
            }

            windows[wid].tabGroups[gid].active = info.tabId;

            await storage.set( { windows } );
        }
        catch( e )
        {
            console.error( e );
        }
    }

    async function TabUpdated( tabId, info, tab )
    {
        try
        {
            if( info.audible == undefined )
            {
                return;
            }
    
            dlog( 'TabUpdated', tabId, info, tab );
    
            let wid = windowIds[tab.windowId.toString()];
    
            if( windows[wid] == undefined || !windows[wid].init )
            {
                dlog( 'TabUpdated : aborted' );
                return;
            }

            let gid = await browser.sessions.getTabValue( tabId, "groupId" );

            if( !gid )
            {
                dlog( `TabUpdated : gid is null` );
                return;
            }

            if( windows[wid] == undefined )
            {
                dlog( `TabUpdated : window is removed.` );
                return;
            }
    
            let idx = windows[wid].tabGroups[gid].tabs.indexOf( tab.id );
    
            if( idx == -1 )
            {
                throw `TabUpdated : idx is -1`;
            }

            let aidx = windows[wid].tabGroups[gid].audibleTabs.indexOf( tab.id );

            if( info.audible )
            {
                if( aidx == -1 )
                {
                    windows[wid].tabGroups[gid].audibleTabs.push( tab.id );
                }
            }
            else
            {
                if( aidx != -1 && !tab.mutedInfo.muted )
                {
                    windows[wid].tabGroups[gid].audibleTabs.splice( aidx, 1 );

                    if( windows[wid].tabGroups[gid].audibleTabs.length == 0 ) 
                    {
                        windows[wid].tabGroups[gid].muted = false;
                    }
                }
            }
    
            if( gClient )
            {
                gClient.postMessage( { msg:bgMsg.TabGroupUpdated, data:windows[wid].tabGroups } );
            }
        }
        catch( e )
        {
            console.error( e );
        }
    }

    function WindowFocusChanged( windowId )
    {
        try
        {
            if( windowId == browser.windows.WINDOW_ID_NONE )
            {
                return;
            }

            dlog( `WindowFocusChanged`, windowId );

            state.currentWindow = windowIds[windowId.toString()];

            if( state.currentWindow == undefined )
            {
                return WindowFocusChanged( windowId );
            }
        }
        catch( e )
        {
            console.error( e );
        }
    }

    async function WindowOnCreated( windowObj )
    {
        try
        {
            dlog( `Window onCreated`, windowObj );

            let newKey = GetNewWindowId().toString();

            windowIds[windowObj.id.toString()] = newKey;

            windows[newKey] = Clone( defaultWindows["template"] );

            windows[newKey].id = windowObj.id;

            let restoredId = await browser.sessions.getWindowValue( windowObj.id, sessionKeys.windowId );

            if( restoredId != undefined )
            {             
                let sessionInfo = await browser.sessions.getWindowValue( windowObj.id, sessionKeys.windowInfo );

                for( let restoredGroupId in sessionInfo.groupInfo )
                {
                    windows[newKey].tabGroups[restoredGroupId] = Clone( defaultWindows["template"].tabGroups["1"] );

                    windows[newKey].tabGroups[restoredGroupId].name = sessionInfo.groupInfo[restoredGroupId];
                }

                windows[newKey].currentGroup = sessionInfo.currentGroup;
                
                let tabs = await browser.tabs.query( { windowId: windowObj.id } );

                for( let tab of tabs )
                {
                    let groupId = await browser.sessions.getTabValue( tab.id, sessionKeys.tabGroupId );

                    let active = await browser.sessions.getTabValue( tab.id, sessionKeys.tabActive );

                    if( tab.active || active != undefined )
                    {
                        windows[newKey].tabGroups[groupId].active = tab.id;
                    }

                    await AddTabToGroup( newKey, groupId, tab );
                }
            }
            else
            {
                await browser.sessions.setWindowValue( windowObj.id, sessionKeys.windowId, newKey.toString() );

                let tabs = await browser.tabs.query( { windowId: windowObj.id } );

                for( let tab of tabs )
                {
                    if( tab.active )
                    {
                        windows[newKey].tabGroups["1"].active = tab.id;

                        await browser.sessions.setTabValue( tab.id, sessionKeys.tabActive, "1" );
                    }

                    await AddTabToGroup( newKey, "1", tab );
                }

                await SetWindowSessionInfo( windowObj.id, windows[newKey].tabGroups );
            }

            windows[newKey].init = true;

            await storage.set( { windows } );

            await RecreateMenus();
        }
        catch( e )
        {
            console.error( e );
        }
    }

    async function WindowOnRemoved( windowId )
    {
        try{
            dlog( `Window onRemoved : ${windowId}` );

            let removeProp = windowIds[windowId.toString()];

            delete windows[removeProp.toString()];

            delete windowIds[windowId.toString()];

            let cWindow = await browser.windows.getCurrent();

            state.currentWindow = windowIds[cWindow.id];

            await storage.set( { state } );

            await storage.set( { windows } );

            await RecreateMenus();
        }
        catch( e )
        {
            console.error( e );
        }
    }
    //#endregion

    //#region init, load
    try
    {
        let data = await storage.get( "settings" );
        
        let lSettings = data.settings;
        
        if( lSettings == undefined )
        {
            await Initialize();
    
            dlog( "init : done", windows, state, settings );
        }
        else
        {
            await Load( lSettings );
    
            dlog( "load : done", windows, state, settings );
        }
    }
    catch( e )
    {
        console.error( e );
    }
    //#endregion

    //#region add event listeners
    browser.windows.onFocusChanged.addListener( WindowFocusChanged );

    browser.windows.onCreated.addListener( WindowOnCreated );

    browser.windows.onRemoved.addListener( WindowOnRemoved );

    browser.tabs.onActivated.addListener( TabActivated );

    browser.tabs.onCreated.addListener( TabCreated );

    browser.tabs.onRemoved.addListener( TabRemoved );

    browser.tabs.onDetached.addListener( TabDetached );

    browser.tabs.onAttached.addListener( TabAttached );

    browser.tabs.onUpdated.addListener( TabUpdated );
    //#endregion

    //#region runtime listener
    browser.runtime.onConnect.addListener( client => {

        gClient = client;

        client.onMessage.addListener( async ( obj ) => { 
            dlog( `client message`, obj );
            switch( obj.msg )
            {
                case bgMsg.GetInfos:
                {
                    try
                    {
                        let wid = state.currentWindow;

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.GetInfos, data: { succeeded: true, settings: settings, currentGroup: windows[wid].currentGroup, tabGroups: windows[wid].tabGroups } } );
                        }
                    }
                    catch( e )
                    {
                        console.error( e );

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.GetInfos, data: { succeeded: false, err: e } } );    
                        }
                    }

                    break;
                }
                case bgMsg.AddNewGroup:
                {
                    try
                    {
                        let wid = state.currentWindow;

                        let newGroupId = GetNewGroupId( wid ).toString();
    
                        let newGroupName = "NewGroup";
    
                        windows[wid].tabGroups[newGroupId] = Clone( defaultWindows["template"].tabGroups["1"] );

                        windows[wid].tabGroups[newGroupId].name = newGroupName;

                        let currentGroup = windows[wid].currentGroup;

                        windows[wid].currentGroup = newGroupId;

                        var newTab = await browser.tabs.create( { windowId: windows[wid].id, active: false } );

                        await browser.tabs.hide( newTab.id );

                        windows[wid].currentGroup = currentGroup;
    
                        await storage.set( { windows } );

                        await SetWindowSessionInfo( windows[wid].id, windows[wid].tabGroups );
    
                        await RecreateMenus();
    
                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.AddNewGroup, data: { succeeded: true, tabGroups: windows[wid].tabGroups } } );
                        }
                    }
                    catch( e )
                    {
                        console.error( e );

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.AddNewGroup, data: { succeeded: false, err: e } } );
                        }
                    }
                    
                    break;
                }
                case bgMsg.ResetAll:
                {
                    try
                    {
                        await ResetAll();

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.ResetAll, data: { succeeded: true } } );
                        }
                    }
                    catch( e )
                    {
                        console.error( e );

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.ResetAll, data: { succeeded: false, err: e } } );
                        }
                    }
                    
                    break;
                }
                case bgMsg.SetCurrentGroup:
                {
                    try
                    {
                        let wid = state.currentWindow;

                        await SetCurrentGroup( obj.data.id.toString() );
                        
                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.SetCurrentGroup, data: { succeeded: true, currentGroup: obj.data.id , tabGroups: windows[wid].tabGroups } } );
                        }
                    }
                    catch( e )
                    {
                        console.error( e );

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.SetCurrentGroup, data: { succeeded: false, err: e } } );
                        }
                    }

                    break; 
                }
                case bgMsg.SetGroupName:
                {
                    try
                    {
                        let targetWindowId = state.currentWindow;

                        let tabGroupId = obj.data.id;

                        let oldName = windows[targetWindowId].tabGroups[tabGroupId].name;

                        let newName = obj.data.name;
    
                        windows[targetWindowId].tabGroups[tabGroupId].name = newName;
    
                        storage.set( { windows } );

                        await SetWindowSessionInfo( windows[targetWindowId].id, windows[targetWindowId].tabGroups );
    
                        await RecreateMenus();
    
                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.SetGroupName, data: { succeeded: true, id: tabGroupId, oldname: oldName, newname: newName } } );
                        }
                    }
                    catch( e )
                    {
                        console.error( e );

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.SetGroupName, data: { succeeded: false, err: e } } );
                        }
                    }

                    break;
                }
                case bgMsg.RemoveTabGroup:
                {
                    try
                    {
                        let targetWindowId = state.currentWindow;

                        let targetGroupId = obj.data.id.toString();

                        if( windows[targetWindowId].currentGroup == targetGroupId )
                        {
                            if( Object.keys( windows[targetWindowId].tabGroups ).length == 1 )
                            {
                                throw `Can't remove the last group.`;
                            }

                            let nextGroupId = undefined;

                            for( let group in windows[targetWindowId].tabGroups )
                            {
                                if( group != targetGroupId )
                                {
                                    nextGroupId = group;

                                    break;
                                }
                            }

                            await SetCurrentGroup( nextGroupId );

                            if( client )
                            {
                                client.postMessage( { msg: bgMsg.SetCurrentGroup, data: { succeeded: true, id: nextGroupId } } );
                            }
                        }

                        browser.tabs.onRemoved.removeListener( TabRemoved );

                        await browser.tabs.remove( windows[targetWindowId].tabGroups[targetGroupId].tabs );

                        delete windows[targetWindowId].tabGroups[targetGroupId];

                        browser.tabs.onRemoved.addListener( TabRemoved );

                        await storage.set( { windows } );

                        await SetWindowSessionInfo( windows[targetWindowId].id, windows[targetWindowId].tabGroups );

                        await RecreateMenus();

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.RemoveTabGroup, data: { succeeded: true, id: obj.data.id } } );
                        }
                    }
                    catch( e )
                    {
                        console.error( e );

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.RemoveTabGroup, data: { succeeded: false, err: e } } );
                        }
                    }

                    break;
                }
                case bgMsg.DiscardOneTime:
                {
                    try
                    {
                        let wid = state.currentWindow;

                        for( let gid in windows[wid].tabGroups )
                        {
                            if( gid != windows[wid].currentGroup )
                            {
                                await browser.tabs.discard( windows[wid].tabGroups[gid].tabs );
    
                                windows[wid].audibleTabs = [];
    
                                windows[wid].muted = false;
                            }
                        }
    
                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.DiscardOneTime, data: { succeeded: true } } );
                        }
                    }
                    catch( e )
                    {
                        console.error( e );
                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.DiscardOneTime, data: { succeeded: false, err: e } } );
                        }
                    }

                    break;
                }
                case bgMsg.MuteTabGroup:
                {
                    try
                    {
                        let wid = state.currentWindow;

                        let gid = obj.data;
    
                        windows[wid].tabGroups[gid].muted = true;
    
                        for( let tabid of windows[wid].tabGroups[gid].audibleTabs )
                        {
                            await browser.tabs.update( tabid, { muted:true} );
                        }
    
                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.MuteTabGroup, data: { succeeded: true, id: gid } } );
                        }
                    }
                    catch( e )
                    {
                        console.error( e );

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.MuteTabGroup, data: { succeeded: false, err: e } } );
                        }
                    }
                    
                    break;
                }
                case bgMsg.UnmuteTabGroup:
                {
                    try
                    {
                        let wid = state.currentWindow;

                        let gid = obj.data;

                        windows[wid].tabGroups[gid].muted = false;

                        for( let tabid of windows[wid].tabGroups[gid].audibleTabs )
                        {
                            await browser.tabs.update( tabid, { muted:false } );
                        }

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.UnmuteTabGroup, data: { succeeded: true, id: gid } } );
                        }
                    }
                    catch( e )
                    {
                        console.error( e );

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.UnmuteTabGroup, data: { succeeded: true, err: e } } );
                        }
                    }

                    break;
                }
                case bgMsg.SetNoDicard:
                {
                    try
                    {
                        let wid = state.currentWindow;

                        let gid = obj.data.groupId;
    
                        let noDiscard = obj.data.value;
    
                        windows[wid].tabGroups[gid].noDiscard = noDiscard;
    
                        await storage.set( { windows } );
                    }
                    catch( e )
                    {
                        console.error( e );
                    }

                    break;
                }
                //setting
                case bgMsg.SetDiscardWhenHidden:
                {
                    try
                    {
                        settings.discardWhenHidden = obj.data;

                        await storage.set( { settings } );

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.SetDiscardWhenHidden, data: settings.discardWhenHidden } );
                        }           
                    }
                    catch( e )
                    {
                        console.error( e );
                    }

                    break;
                }
                case bgMsg.SetMuteWhenHidden:
                {
                    try
                    {
                        settings.muteWhenHidden = obj.data;

                        await storage.set( { settings } );
                    }
                    catch( e )
                    {
                        console.error( e );
                    }
                    
                    break;
                }
                case bgMsg.SetDebug:
                {
                    try
                    {
                        settings.debug = obj.data;
                    
                        await storage.set( { settings } );
                    }
                    catch( e )
                    {
                        console.error( e );
                    }
                    
                    break;
                }
                case bgMsg.SetShowAdvancedButtons:
                {
                    try
                    {
                        settings.showAdvancedButtons = obj.data;

                        await storage.set( { settings } );
                    }
                    catch( e )
                    {
                        console.error( e );
                    }

                    break;
                }
                case bgMsg.SetAutoClosePopup:
                {
                    try
                    {
                        settings.autoClosePopup = obj.data;

                        await storage.set( { settings } );
                    }
                    catch( e )
                    {
                        console.error( e );
                    }

                    break;
                }
            }
        } );

        client.onDisconnect.addListener( ev => { 
            client = undefined;

            gClient = undefined;
        } );
    } );
    //#endregion
}

