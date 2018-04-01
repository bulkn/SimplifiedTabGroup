//#region global variables
const storage = browser.storage.local;

const defaultWindows =
{
    "template":
    {
        init: false,
        id: browser.windows.WINDOW_ID_NONE,
        currentGroup: "1",
        tabGroupsOrder: ["1"],
        hideNextNewTab:false,
        nextNewTabGroupId:"",
        tabIdAliases: { },
        tabIndexes: { },
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
                pinnedTabs: []
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
    currentWindow: "",
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

    function SetWindowSessionInfo( windowId = -1 )
    {
        try
        {
            let wid = windowIds[windowId];

            let currentGroup = windows[wid].currentGroup;

            windowSessionInfo = {};

            windowSessionInfo["currentGroup"] = currentGroup;

            windowSessionInfo["groupInfo"] = {};

            windowSessionInfo["tabGroupsOrder"] = windows[wid].tabGroupsOrder;

            for( let groupProp in windows[wid].tabGroups )
            {
                windowSessionInfo["groupInfo"][groupProp] = windows[wid].tabGroups[groupProp].name;
            }
    
            browser.sessions.setWindowValue( windowId, sessionKeys.windowInfo, windowSessionInfo ).catch( e => { 
                console.error( `SetWindowSessionInfo: sessions.setWindowValue( )`, e );
            } );
        }
        catch( e )
        {
            throw e;
        }
    }

    function AddTabToGroup( windowId = "", groupId = "", tab = new Object() )
    {
        try
        {                
            windows[windowId].tabGroups[groupId].tabs.push( tab.id );

            if( tab.audible && tab.width != 0 && tab.height != 0 )
            {
                windows[windowId].tabGroups[groupId].audibleTabs.push( tab.id );
            }

            if( tab.pinned )
            {
                windows[windowId].tabGroups[groupId].pinnedTabs.push( tab.id );
            }
    
            windows[windowId].tabIndexes[tab.id.toString()] = groupId;

            browser.sessions.setTabValue( tab.id, sessionKeys.tabGroupId, groupId ).catch( e => { console.error( `AddTabToGroup: setTabValue()`, e ) } );
        }
        catch( e )
        {
            throw e;
        }
    }

    function RemoveTabFromGroup( windowId = "", tabId = -1 )
    {
        try
        {
            dlog( `RemoveTabFromGroup`, windowId, tabId );

            let groupId = windows[windowId].tabIndexes[tabId];

            let aliasIdx = Object.values( windows[windowId].tabIdAliases ).indexOf( tabId );

            if( aliasIdx != -1 )
            {
                let keys = Object.keys( windows[windowId].tabIdAliases );

                delete windows[windowId].tabIdAliases[keys[aliasIdx]];
            }

            if( windows[windowId].tabGroups[groupId].active == tabId )
            {
                windows[windowId].tabGroups[groupId].active = browser.tabs.TAB_ID_NONE;
            }
    
            let idx = windows[windowId].tabGroups[groupId].tabs.indexOf( tabId );
    
            let aidx = windows[windowId].tabGroups[groupId].audibleTabs.indexOf( tabId );

            let pidx = windows[windowId].tabGroups[groupId].pinnedTabs.indexOf( tabId );
    
            if( idx == -1 )
            {
                throw `RemoveTabFromGroup : idx is null. windows[${windowId}].tabGroups[${groupId}].tabs.indexOf( ${tabId} )`;
            }
    
            windows[windowId].tabGroups[groupId].tabs.splice( idx, 1 );
    
            if( aidx != -1 )
            {
                windows[windowId].tabGroups[groupId].audibleTabs.splice( aidx, 1 );
            }

            if( pidx != -1 )
            {
                windows[windowId].tabGroups[groupId].pinnedTabs.splice( pidx, 1 );
            }

            delete windows[windowId].tabIndexes[tabId];
    
            //create new tab, tabgroup never be empty
            if( windows[windowId].tabGroups[groupId].tabs.length == 0 )
            {
                //happens when user showed hidden tab from urlbar on about:newtab
                if( groupId != windows[windowId].currentGroup )
                {
                    windows[windowId].hideNextNewTab = true;

                    windows[windowId].nextNewTabGroupId = groupId;

                    browser.tabs.create( { active: false, windowId: windows[windowId].id } ).catch( e => { 
                        console.error( `RemoveTabFromGroup: tabs.create( { active: false, hidden: true, windowId: ${windows[windowId].id} } )`, e );
                    } );
                }
                else
                {
                    browser.tabs.create( { active: true, windowId: windows[windowId].id } ).catch( e => { 
                        console.error( `RemoveTabFromGroup: tabs.create( { active: true, windowId: ${windows[windowId].id} } )`, e );
                    } );
                }
            }
        }
        catch( e )
        {
            throw e;
        }
    }

    function MoveTabInTheSameWindow( windowId = "", groupFrom = "", groupTo = "", tabId = -1 )
    {
        try
        {
            let idx = windows[windowId].tabGroups[groupFrom].tabs.indexOf( tabId );

            let aIdx = windows[windowId].tabGroups[groupFrom].audibleTabs.indexOf( tabId );

            let pIdx = windows[windowId].tabGroups[groupFrom].pinnedTabs.indexOf( tabId );
    
            windows[windowId].tabGroups[groupFrom].tabs.splice( idx, 1 );
    
            windows[windowId].tabGroups[groupTo].tabs.push( tabId );
    
            if( aIdx != -1 )
            {
                windows[windowId].tabGroups[groupFrom].audibleTabs.splice( aIdx, 1 );
    
                windows[windowId].tabGroups[groupTo].audibleTabs.push( tabId );
            }

            if( pIdx != -1 )
            {
                windows[windowId].tabGroups[groupFrom].pinnedTabs.splice( aIdx, 1 );
    
                windows[windowId].tabGroups[groupTo].pinnedTabs.push( tabId );
            }
    
            windows[windowId].tabIndexes[tabId] = groupTo;

            browser.sessions.setTabValue( tabId, sessionKeys.tabGroupId, groupTo ).catch( e => {
                console.error( `MoveTabInTheSameWindow: setTabValue()`, e );
            } );
        }
        catch( e )
        {
            throw e;
        }
        
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
        
                        AddTabToGroup( wid, "1", tab );
        
                        await browser.sessions.setTabValue( tab.id, sessionKeys.tabGroupId, "1" );
                    }

                    windows[wid].init = true;
        
                    await SetWindowSessionInfo( window.id );
        
                    windowId++;
                }
        
                await storage.set( { windows } );
        
                state = Clone( defaultState );
        
                let cWindow = await browser.windows.getCurrent();
        
                state.currentWindow = await browser.sessions.getWindowValue( cWindow.id, sessionKeys.windowId );
        
                await storage.set( { state } );
        
                await RecreateMenu( );
    
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

                    windows[window].tabIdAliases = {};

                    windows[window].tabIndexes = {};

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

                        AddTabToGroup( windowId, groupId, tab );
        
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
        
                //restore/update state
                data = await storage.get( "state" );
        
                state = data.state;

                if( SyncProperty( defaultState, state ) )
                {
                    await storage.set( { state } );
                }
        
                let cWindow = await browser.windows.getCurrent();
        
                state.currentWindow = await browser.sessions.getWindowValue( cWindow.id, sessionKeys.windowId );
        
                await storage.set( { state } );
        
                //create menus
                await RecreateMenu( );
    
                resolve( true );
            }
            catch( e )
            {
                reject( e );
            }
        } );
    }

    function RecreateMenu( )
    {
        return new Promise( async ( resolve, reject ) => {
            try
            {
                await browser.menus.removeAll();
    
                let parentId = "stg_menuParent";
                
                await browser.menus.create( {
                    id: parentId,
                    title: "Move to",
                    contexts: ["tab"]
                } );
    
                windowsKeys = Object.keys( windows );
    
                if( windowsKeys.length == 1 )
                {
                    let wid = windowsKeys[0];

                    for( let gid of windows[wid].tabGroupsOrder )
                    {
                        let title = "";

                        if( gid == windows[wid].currentGroup )
                        {
                            title = "(c) " + windows[wid].tabGroups[gid].name;
                        }
                        else
                        {
                            title = "    " + windows[wid].tabGroups[gid].name
                        }

                        await browser.menus.create( { parentId: parentId, id: `stg_menu${wid}_${gid}`, title: `${title}`, contexts: ["tab"] } );
                    }
                }
                else
                {
                    for( let wid of windowsKeys )
                    {
                        let windowMenuId = `stg_menuWindow${wid}`;

                        await browser.menus.create( { parentId: parentId, id:windowMenuId, title: `Window ${wid}`, contexts: ["tab"] } )
                        
                        let tabGroupsKeys = Object.keys( windows[wid].tabGroups );
    
                        for( let gid of windows[wid].tabGroupsOrder )
                        {
                            let title = "";

                            if( gid == windows[wid].currentGroup )
                            {
                                title = "(c) " + windows[wid].tabGroups[gid].name;
                            }
                            else
                            {
                                title = "    " + windows[wid].tabGroups[gid].name
                            }

                            await browser.menus.create( { parentId: windowMenuId, id: `stg_menu${wid}_${gid}`, title: `${title}`, contexts: ["tab"] } );
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

            //show tabs, set active tab
            browser.tabs.show( windows[windowId].tabGroups[targetGroupId].tabs );

            if( windows[windowId].tabGroups[targetGroupId].active == browser.tabs.TAB_ID_NONE )
            {
                browser.tabs.update( windows[windowId].tabGroups[targetGroupId].tabs[0], { active:true } ).catch( e => { 
                    console.error( `SetCurrentGroup: tabs.update( ${windows[windowId].tabGroups[targetGroupId].tabs[0]}, { active:true } )`, e );
                } );
            }
            else
            {
                browser.tabs.update( windows[windowId].tabGroups[targetGroupId].active, { active:true } ).catch( e => { 
                    console.error( `SetCurrentGroup: tabs.update( ${windows[windowId].tabGroups[targetGroupId].active}, { active:true } )`, e );
                } );
            }

            //unmute
            if( windows[windowId].tabGroups[targetGroupId].muted )
            {
                for( let atab of windows[windowId].tabGroups[targetGroupId].audibleTabs )
                {
                    browser.tabs.update( atab, { muted:false } ).catch( e => { 
                        console.error( `SetCurrentGroup: tabs.update( ${atab}, { muted:false } )`, e );
                    } );
                }

                windows[windowId].tabGroups[targetGroupId].muted = false;
            }

            //unpin oldgroup tabs
            for( let pTab of windows[windowId].tabGroups[oldGroupId].pinnedTabs )
            {
                browser.tabs.update( pTab, { pinned: false } ).catch( e => {
                    console.error( `SetCurrentGroup tabs.update()`, e );
                } );
            }

            //repin newgrouptabs
            for( let pTab of windows[windowId].tabGroups[targetGroupId].pinnedTabs )
            {
                browser.tabs.update( pTab, { pinned: true } ).catch( e => { 
                    console.error( `SetCurrentGroup tabs.update()`, e );
                } );
            }

            //hide tabs
            for( let tab of windows[windowId].tabGroups[oldGroupId].tabs )
            {
                browser.tabs.hide( tab ).catch( e => {
                    //happens when user showed the hidden tab from urlbar on about:newtab. hmm
                    console.error( `SetCurrentGroup: tabs.hide( )`, e );
                } );
            }

            SetWindowSessionInfo( windows[windowId].id );

            //discard tabs
            if( settings.discardWhenHidden && !windows[windowId].tabGroups[oldGroupId].noDiscard )
            {
                for( let tab of windows[windowId].tabGroups[oldGroupId].tabs )
                {
                    browser.tabs.discard( tab ).catch( e => {
                        //happens when user showed the hidden tab from urlbar on about:newtab. hmm
                        console.error( `SetCurrentGroup: tabs.discard( )`, e );
                    } );
                }

                windows[windowId].tabGroups[oldGroupId].audibleTabs = [];

                windows[windowId].tabGroups[oldGroupId].muted = false;
            }

            //mute tabs
            else if( settings.muteWhenHidden )
            {
                for( let tabid of windows[windowId].tabGroups[oldGroupId].audibleTabs )
                {
                    browser.tabs.update( tabid, { muted:true } ).catch( e => { 
                        console.error( `SetCurrentGroup: tabs.update( )`, e );
                    } );
                }

                if( windows[windowId].tabGroups[oldGroupId].audibleTabs.length != 0 )
                {
                    windows[windowId].tabGroups[oldGroupId].muted = true;
                }

                for( let tabid of windows[windowId].tabGroups[targetGroupId].tabs )
                {
                    browser.tabs.update( tabid, { muted:false } ).catch( e => { 
                        console.error( `SetCurrentGroup: tabs.update( )`, e );
                    } );
                }
            }

            //recreate menus
            RecreateMenu().catch( e => { 
                console.error( `SetCurrentGroup: RecreateMenu()`, e );
            } );

            storage.set( { windows } ).catch( e => { 
                console.error( `SetCurrentGroup: storage.set( { windows } )`, e );
            } );
        }
        catch( e )
        {
            throw e;
        }
    }

    //event listner functions
    async function MenuOnClicked( info, tab )
    {
        try
        {
            dlog( `MenuOnClicked`, info, tab );

            let windowIdFrom = windowIds[tab.windowId];
    
            let groupFrom = windows[windowIdFrom].currentGroup;
    
            let tmp = info.menuItemId.substring( "stg_menu".length ).split( '_' );
    
            let windowIdTo = tmp[0];
    
            let groupTo = tmp[1];
    
            if( windowIdFrom == windowIdTo && groupFrom == groupTo )
            {
                return;
            }

            let tabIdAlias = windows[windowIdFrom].tabIdAliases[tab.id.toString()];

            let tabId;

            if( tabIdAlias != undefined )
            {
                tabId = tabIdAlias;
            }
            else
            {
                tabId = tab.id;
            }

            //set new active tab to hide tab
            if( tab.active )
            {
                let groupIdx = windows[windowIdFrom].tabGroups[groupFrom].tabs.indexOf( tabId );

                if( groupIdx == -1 )
                {
                    throw `MenuOnClicked : groupIdx is -1, windowIdFrom: ${windowIdFrom}, groupFrom: ${groupFrom}, tabId: ${tab.id} }`;
                }

                //create new tab if current group length is 1
                if( windows[windowIdFrom].tabGroups[groupFrom].tabs.length == 1 )
                {
                    let newTab = await browser.tabs.create( { windowId:windows[windowIdFrom].id, active:true } );
                }
                //set active to next tab;
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

            let pinned = tab.pinned;

            //unpin if pinned
            if( pinned )
            {
                browser.tabs.onUpdated.removeListener( TabUpdated );

                await browser.tabs.update( tabId, { pinned: false } );

                browser.tabs.onUpdated.addListener( TabUpdated );
            }

            //move tab between different windows
            if( windowIdFrom != windowIdTo )
            {
                await browser.tabs.move( tabId, { windowId:windows[windowIdTo].id, index:-1 } );

                if( windows[windowIdTo].currentGroup != groupTo )
                {
                    //onAttach sets group to window's currentGroup so.
                    MoveTabInTheSameWindow( windowIdTo, windows[windowIdTo].currentGroup, groupTo, tabId );

                    if( pinned )
                    {
                        windows[windowIdTo].tabGroups[groupTo].pinnedTabs.push( tabId );
                    }

                    await browser.tabs.hide( tabId );
                }
                else if( pinned )
                {
                    browser.tabs.onUpdated.removeListener( TabUpdated );

                    await browser.tabs.update( tabId, { pinned: true } );

                    browser.tabs.onUpdated.addListener( TabUpdated );
                }
            }
            //just hide tab
            else
            {
                MoveTabInTheSameWindow( windowIdTo, groupFrom, groupTo, tabId );

                await browser.tabs.hide( tabId );
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

    function TabRemoved( tabId, info )
    {
        try
        {
            dlog( 'TabRemoved', tabId, info );

            if( info.isWindowClosing )
            {
                return;
            }

            let wid = windowIds[info.windowId.toString()];
    
            RemoveTabFromGroup( wid, tabId );
    
            storage.set( { windows } ).catch( e => { console.error( `TabRemoved : storage.set( { windows } )`, e ) } );
        }
        catch( e )
        {
            console.error( e );
        }
    }

    function TabDetached( tabId, info )
    {
        try
        {
            dlog( 'TabDetached', tabId, info );

            let wid = windowIds[info.oldWindowId];

            if( wid == undefined )
            {
                throw `TabDatached : wid is undefined. windowId:${info.oldWindowId}`;
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
                dlog( `TabDetached`, `aborted`, `window is closing` );

                return;
            }

            RemoveTabFromGroup( wid, tabId );

            storage.set( { windows } ).catch( e => { console.error( `TabDetached : storage.set( { windows } )`, e ); } );
        }
        catch( e )
        {
            console.error( e );
        }
    }

    function TabAttached( tabId, info )
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

            let tab = { id: tabId };

            let gid = windows[wid].currentGroup;

            browser.tabs.get( tabId ).then( aTab => {
                if( tabId != aTab.id )
                {
                    windows[wid].tabIdAliases[aTab.id] = tabId;
                }
                if( aTab.audible )
                {
                    windows[wid].tabGroups[gid].audibleTabs.push( tabId );
                }
                if( aTab.pinned )
                {
                    windows[wid].tabGroups[gid].pinnedTabs.push( tabId );
                }
            } ).catch( e => { console.error( `TabAttached: tabs.get()`, e ); } );
            
            AddTabToGroup( wid, gid, tab );

            storage.set( { windows } ).catch( e => { console.error( `TabAttached: storage.set( { windows } )`, e ); } );
        }
        catch( e )
        {
            console.error( e );
        }
    }

    function TabCreated( tab )
    {
        try
        {
            dlog( 'TabCreated', tab );

            let wid = windowIds[tab.windowId.toString()];

            if( wid == undefined || !windows[wid].init)
            {
                dlog( `TabCreate : aborted` );

                return;
            }

            //happens when user showed hidden tab from urlbar on about:newtab
            if( windows[wid].hideNextNewTab )
            {
                AddTabToGroup( wid, windows[wid].nextNewTabGroupId, tab );

                browser.tabs.hide( tab.id ).catch( e => { 
                    console.error( `TabCreated: tabs.hide( ${tab.id} )`, e );
                } );
            }
            else
            {
                AddTabToGroup( wid, windows[wid].currentGroup, tab );
            }
            
            storage.set( { windows } ).catch( e => { console.error( `TabCreated : storage.set( { windows } )`, e ) } );
        }
        catch( e )
        {
            console.error( e );
        }
    }

    function TabActivated( info ) //info = { tabId, windowId }
    {
        try
        {
            dlog( 'TabActivated', info.tabId, info.windowId );

            let wid = windowIds[info.windowId.toString()];

            if( windows[wid] == undefined || !windows[wid].init )
            {
                dlog( `TabActivated : aborted. window is creating.` );

                return;
            }

            let gid = windows[wid].tabIndexes[info.tabId];

            let currentGroupChange = false;

            //unwanted tab is showed
            if( windows[wid].currentGroup != gid )
            {
                //happens when user removed the last tab of the currentGroup
                if( windows[wid].tabGroups[windows[wid].currentGroup].tabs.length == 0 )
                {
                    dlog( `TabActivated : hiding unwanted tab.`, `tabid:${info.tabId}`, `currentGroup:${windows[wid].currentGroup}`, `gid:${gid}` );

                    browser.tabs.hide( info.tabId ).catch( e => { console.error( `TabActivated: tabs.hide( ${info.tabId} )`, e ); } );

                    return;
                }
                //happens when user showed the hidden tab from urlbar
                else
                {
                    dlog( `TabActivated: change current group.`, `tabid:${info.tabId}`, `currentGroup:${windows[wid].currentGroup}`, `gid:${gid}` );

                    //just wait a little bit
                    browser.tabs.get( windows[wid].tabGroups[windows[wid].currentGroup].active ).then( t => {
                        SetCurrentGroup( gid );
                    } ).catch( e => { 
                        //happens when user showed the hidden tab from urlbar on about:newtab
                        dlog( `TabActivated: old actived tab is removed.` );
                        SetCurrentGroup( gid );
                    } );
                }
            }

            //change active tab of target group
            if( windows[wid].tabGroups[gid].active == browser.tabs.TAB_ID_NONE )
            {
                browser.sessions.setTabValue( info.tabId, sessionKeys.tabActive, "1" ).catch( e => { 
                    console.error( `TabActivated: sessions.setTabValue( )`, e ); 
                } );
            }
            else if( windows[wid].tabGroups[gid].active != info.tabId )
            {
                browser.sessions.removeTabValue( windows[wid].tabGroups[gid].active, sessionKeys.tabActive ).catch( e => {
                    console.error( `TabActivated: sessions.removeTabValue( )`, e ); 
                } );

                browser.sessions.setTabValue( info.tabId, sessionKeys.tabActive, "1" ).catch( e => {
                    console.error( `TabActivated: sessions.setTabValue( )`, e ); 
                } );
            }

            windows[wid].tabGroups[gid].active = info.tabId;

            storage.set( { windows } ).catch( e => { console.error( `TabActivated: storage.set( { windows } )`, e ); } );
        }
        catch( e )
        {
            console.error( e );
        }
    }

    function TabUpdated( tabId, info, tab )
    {
        try
        {
            let changeInfo;

            if( info.audible == undefined && info.pinned == undefined )
            {
                return;
            }
            
            if( info.audible != undefined )
            {
                changeInfo = "audible";
            }
            else if( info.pinned != undefined )
            {
                changeInfo = "pinned";
            }
    
            dlog( 'TabUpdated', tabId, info, tab );
    
            let wid = windowIds[tab.windowId.toString()];
    
            if( windows[wid] == undefined || !windows[wid].init )
            {
                dlog( 'TabUpdated : aborted' );
                return;
            }

            let tabIdAlias = windows[wid].tabIdAliases[tab.id.toString()];

            let fixedTabId;

            if( tabIdAlias != undefined )
            {
                fixedTabId = tabIdAlias;
            }
            else
            {
                fixedTabId = tab.id;
            }

            let gid = windows[wid].tabIndexes[fixedTabId];

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
    
            let idx = windows[wid].tabGroups[gid].tabs.indexOf( fixedTabId );
    
            if( idx == -1 )
            {
                throw `TabUpdated : idx is -1`;
            }

            switch( changeInfo )
            {
                case "audible":
                {
                    let aidx = windows[wid].tabGroups[gid].audibleTabs.indexOf( fixedTabId );

                    if( info.audible )
                    {
                        if( aidx == -1 )
                        {
                            windows[wid].tabGroups[gid].audibleTabs.push( fixedTabId );
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
                    
                    break;
                }
                case "pinned":
                {
                    if( gid != windows[wid].currentGroup )
                    {
                        dlog( `pinned ignore.`);

                        return;
                    }

                    let pIdx;

                    if( info.pinned )
                    {
                        pIdx = windows[wid].tabGroups[gid].pinnedTabs.indexOf( fixedTabId );

                        if( pIdx == -1 )
                        {
                            windows[wid].tabGroups[gid].pinnedTabs.push( fixedTabId );
                        }
                    }
                    else
                    {
                        pIdx = windows[wid].tabGroups[gid].pinnedTabs.indexOf( fixedTabId );

                        if( pIdx != -1 )
                        {
                            windows[wid].tabGroups[gid].pinnedTabs.splice( pIdx, 1 );
                        }
                    }
                    
                    storage.set( { windows } ).catch( e => { console.error( 'TabUpdate storage.set()', e ); } );

                    break;
                }
                    
            }
        }
        catch( e )
        {
            console.error( e );
        }
    }

    async function WindowFocusChanged( windowId )
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
                let window = await browser.windows.get( windowId );

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

                windows[newKey].tabGroupsOrder = sessionInfo.tabGroupsOrder;
                
                let tabs = await browser.tabs.query( { windowId: windowObj.id } );

                for( let tab of tabs )
                {
                    let groupId = await browser.sessions.getTabValue( tab.id, sessionKeys.tabGroupId );

                    let active = await browser.sessions.getTabValue( tab.id, sessionKeys.tabActive );

                    if( tab.active || active != undefined )
                    {
                        windows[newKey].tabGroups[groupId].active = tab.id;
                    }

                    AddTabToGroup( newKey, groupId, tab );
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

                    AddTabToGroup( newKey, "1", tab );
                }

                await SetWindowSessionInfo( windowObj.id );
            }

            windows[newKey].init = true;

            await storage.set( { windows } );

            await RecreateMenu();
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

            await RecreateMenu();
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

                        let clientState = 
                        {
                            currentGroup: windows[wid].currentGroup,
                            tabGroupsOrder: windows[wid].tabGroupsOrder
                        }

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.GetInfos, data: { succeeded: true, settings: settings, state: clientState, tabGroups: windows[wid].tabGroups } } );
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

                        await SetWindowSessionInfo( windows[wid].id );

                        windows[wid].tabGroupsOrder.push( newGroupId );

                        await RecreateMenu();

                        await storage.set( { windows } );
    
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

                        await SetWindowSessionInfo( windows[targetWindowId].id );
    
                        await RecreateMenu();
    
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
                        }

                        browser.tabs.onRemoved.removeListener( TabRemoved );

                        await browser.tabs.remove( windows[targetWindowId].tabGroups[targetGroupId].tabs );

                        delete windows[targetWindowId].tabGroups[targetGroupId];

                        browser.tabs.onRemoved.addListener( TabRemoved );

                        await storage.set( { windows } );

                        await SetWindowSessionInfo( windows[targetWindowId].id );

                        //set tabGroupsOrder
                        let orderIdx = windows[targetWindowId].tabGroupsOrder.indexOf( targetGroupId );

                        if( orderIdx == -1 )
                        {
                            throw [ `orderIdx is -1`, windows[targetWindowId].tabGroupsOrder ];
                        }

                        windows[targetWindowId].tabGroupsOrder.splice( orderIdx, 1 );

                        await RecreateMenu();

                        await storage.set( { windows } );

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

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.SetNoDicard, data: { succeeded: true, id: gid, noDiscard: obj.data.value } } );
                        }
                    }
                    catch( e )
                    {
                        console.error( e );

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.SetNoDicard, data: { succeeded: false, err: e } } );
                        }
                    }

                    break;
                }
                case bgMsg.SetTabGroupsOrder:
                {
                    try
                    {
                        let wid = state.currentWindow;

                        windows[wid].tabGroupsOrder = obj.data;

                        SetWindowSessionInfo( windows[wid].id );

                        await RecreateMenu();

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
                            client.postMessage( { msg: bgMsg.SetDiscardWhenHidden, data:{ succeeded: true, discardWhenHidden: settings.discardWhenHidden } } );
                        }           
                    }
                    catch( e )
                    {
                        console.error( e );
                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.SetDiscardWhenHidden, data:{ succeeded: false, err: e } } );
                        } 
                    }

                    break;
                }
                case bgMsg.SetMuteWhenHidden:
                {
                    try
                    {
                        settings.muteWhenHidden = obj.data;

                        await storage.set( { settings } );

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.SetMuteWhenHidden, data: { succeeded: true, muteWhenHidden: obj.data } } );
                        }
                    }
                    catch( e )
                    {
                        console.error( e );

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.SetMuteWhenHidden, data: { succeeded: false, err: e } } );
                        }
                    }
                    
                    break;
                }
                case bgMsg.SetDebug:
                {
                    try
                    {
                        settings.debug = obj.data;
                    
                        await storage.set( { settings } );

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.SetDebug, data: { succeeded: true, debug: obj.data } } );
                        }
                    }
                    catch( e )
                    {
                        console.error( e );

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.SetDebug, data: { succeeded: false, err: e } } );
                        }
                    }
                    
                    break;
                }
                case bgMsg.SetShowAdvancedButtons:
                {
                    try
                    {
                        settings.showAdvancedButtons = obj.data;

                        await storage.set( { settings } );

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.SetShowAdvancedButtons, data: { succeeded: true, showAdvancedButtons: obj.data } } );
                        }
                    }
                    catch( e )
                    {
                        console.error( e );

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.SetShowAdvancedButtons, data: { succeeded: false, err: e } } );
                        }
                    }

                    break;
                }
                case bgMsg.SetAutoClosePopup:
                {
                    try
                    {
                        settings.autoClosePopup = obj.data;

                        await storage.set( { settings } );

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.SetAutoClosePopup, data: { succeeded: true, autoClosePopup: obj.data } } );
                        }
                    }
                    catch( e )
                    {
                        console.error( e );

                        if( client )
                        {
                            client.postMessage( { msg: bgMsg.SetAutoClosePopup, data: { succeeded: false, err: e } } );
                        }
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

