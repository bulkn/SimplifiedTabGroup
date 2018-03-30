//#region global variables
var tabGroups = 
{
    "1":
    {
        name:"Default",
        muted:false,
        active:browser.tabs.TAB_ID_NONE,
        noDiscard:false,
        tabs:[],
        audibleTabs:[],
    }
}

var tabGroupsPager = 
{
    max:10,
    current:0,
};

var state = 
{ 
    currentGroup:"",
    tabGroupsOrder:[]
};

var settings = 
{
    init:false,
    debug:false,
    autoClosePopup:false,
    discardWhenHidden:false,
    muteWhenHidden:false,
    showAdvancedButtons:false,
    showDiscardButton:false,
    showResetButton:false
}

var port;

var emPixel;

var tabGroupTableMaxHeight = 0;
//#endregion

function dlog( ...args )
{
    if( settings.debug )
    {
        console.log( 'dlog', JSON.parse(JSON.stringify(args) ) );
    }
}

function Notice( msg = "" )
{
    let elem = document.getElementById( "div_notice" );

    let tn = document.createTextNode( msg );

    ClearNode( elem );

    elem.appendChild( tn );
    
    setInterval( ev => {
        ClearNode( elem );
    }, 5000 );
}

//#region tab group management functions
function ChangeGroupName( ev ) 
{
    var id = ev.target.id.substr( "groupID_".length );
    port.postMessage( { msg:bgMsg.SetGroupName, data:{ id:id, name:ev.target.value } } );
}

function ChagneCurrentGroup( ev )
{
    if( ev.target.id == `groupMarkID_${state.currentGroup}`)
    {
        return;
    }

    var id = ev.target.id.substr( "groupMarkID_".length );

    port.postMessage( { msg: bgMsg.SetCurrentGroup, data:{ "id": id } } );
}

function AddGroup()
{
    if( !initDone )
    {
        return;
    }

    port.postMessage( { msg:bgMsg.AddNewGroup } );
}

function RemoveTab( targetId = "" )
{
    if( Object.keys( tabGroups ).length == 1 )
    {
        Notice( "Can not remove the last group.");
        return;
    }

    if( targetId.length == 0 )
    {
        Notice( "targetId is null." );
        return;
    }

    if( confirm( `Remove "${ tabGroups[targetId].name }" group?\r\n( contains ${tabGroups[targetId].tabs.length == 0 ? 1 : tabGroups[targetId].tabs.length } tabs. )` ) )
    {
        port.postMessage( { msg: bgMsg.RemoveTabGroup, data:{ "id": targetId } } );
    }
}

function ChangeTabGroupsOrder( targetId = "", order = "up" ) // order "up" or "down"
{
    function init()
    {
        state.tabGroupsOrder = [];

        for( let gid in tabGroups )
        {
            state.tabGroupsOrder.push( gid );
        }
    }

    if( state.tabGroupsOrder.length == 0 )
    {
        init();        
    }

    let idx = state.tabGroupsOrder.indexOf( targetId );

    if( idx == - 1 )
    {
        let msg = `Error: ChangeTabGroupsOrder() idx is -1, targetId:${targetId}`;
        Notice( msg );
        console.error( msg );
        return;
    }

    let idxForReplace = -1;

    if( order == "up" )
    {
        if( idx > 0 )
        {
            idxForReplace = idx - 1;
        }
    }
    else
    {
        if( idx < ( state.tabGroupsOrder.length - 1 ) )
        {
            idxForReplace = idx + 1;
        }
    }

    if( idxForReplace == -1 )
    {
        return;
    }

    let tmpValue = state.tabGroupsOrder[idxForReplace];

    state.tabGroupsOrder[idxForReplace] = state.tabGroupsOrder[idx];

    state.tabGroupsOrder[idx] = tmpValue;

    port.postMessage( { msg: bgMsg.SetTabGroupsOrder, data: state.tabGroupsOrder } );

    CreateTabGroupsHtml();


}
//#endregion

//#region html functions
function ClearNode( node )
{
    while ( node.firstChild ) {
        node.removeChild(node.firstChild);
    }
}
function MakeElement( tag = "", attributes = {}, styles = {}, text = "" )
{
    let elem = document.createElement( tag );

    for( let a in attributes )
    {
        elem.setAttribute( a, attributes[a] );
    }

    for( let s in styles )
    {
        elem.style[s] = styles[s];
    }

    if( text.length != 0 )
    {
        let tn = document.createTextNode( text );

        elem.appendChild( tn );
    }

    return elem;
}

function SetEmPixel()
{
    let newElem = document.createElement( "span" );
    let ret;

    newElem.style["font-size"] = "1em";

    newElem.style["position"] = "absolute";

    newElem.style["top"] = "-100px";

    newElem.appendChild( document.createTextNode("Text") );

    document.body.appendChild( newElem );

    emPixel = newElem.offsetHeight;

    document.body.removeChild( newElem );
}

function RefreshTabGroupList()
{
    let collection = document.getElementsByClassName( "cGroupNameInput" );

    for( let elem of collection )
    {
        elem.addEventListener( "change", ChangeGroupName );

        //init value
        let id = elem.id.substr( "groupID_".length );
        
        elem.value = tabGroups[id].name;
    }

    collection = document.getElementsByClassName( "cCurrentGroupMark" );

    for( let elem of collection )
    {
        elem.addEventListener( "click", ChagneCurrentGroup );
    }

    collection = document.getElementsByClassName( "cTabGroupMenuButton" );

    for( let elem of collection )
    {
        elem.addEventListener( "click", OnTabGroupMenuClicked );
    }

    collection = document.getElementsByClassName( "cUnmuteTabGroup" );

    for( let elem of collection )
    {
        elem.addEventListener( "click", OnUnmuteClicked );
    }

    collection = document.getElementsByClassName( "cMuteTabGroup" );

    for( let elem of collection )
    {
        elem.addEventListener( "click", OnMuteClicked );
    }

    collection = document.getElementsByClassName( "cNoDicard" );

    for( let elem of collection )
    {
        elem.addEventListener( `change`, OnNoDiscardChanged );
    }
}

function MakeTabGroupRow( name = "", id = "", currentGroup = false )
{
    let tr = MakeElement( 'tr', { class: `cTabGroupRow`, id: `groupRowID_${id}` } );

    //#region make currentGroup mark
    let mark;

    if( currentGroup )
    {
        mark = `../Resources/mark_rightTriangle.svg`;
    }
    else
    {
        mark = `../Resources/mark_circle.svg`;
    }

    let td = MakeElement( 'td' );

    let btn = MakeElement( 'button', { class: 'cCurrentGroupMark', id: `groupMarkID_${id}`, tabindex: "2" } );

    let img = MakeElement( 'img', { class: 'cButtons', src: mark } );

    btn.appendChild( img );

    td.appendChild( btn );

    tr.appendChild( td );
    //#endregion

    //#region make group name input
    td = MakeElement( 'td' );

    let input = MakeElement( 'input', { type: 'text', class: 'cGroupNameInput', id: `groupID_${id}`, tabindex: "1" } );

    td.appendChild( input );

    tr.appendChild( td );
    //#endregion

    //#region make audible mark
    td = MakeElement( 'td' );

    if( tabGroups[id].audibleTabs.length == 0 )
    {
        tr.appendChild( td );
    }
    else
    {
        let mark = '';

        let className = '';

        if( tabGroups[id].muted )
        {
            mark = '../Resources/mark_speakerMuted.svg';

            className = 'cUnmuteTabGroup';
        }
        else
        {
            mark = '../Resources/mark_speaker.svg';

            className = 'cMuteTabGroup';
        }

        let btn = MakeElement( 'button', { class: className, id: `groupMuteID_${id}`, tabindex: `3` } );

        let img = MakeElement( 'img', { class: `cButtons`, src: mark } );

        btn.appendChild( img );

        td.appendChild( btn );

        tr.appendChild( td );
    }
    //#endregion

    //#region make noDiscard checkbox
    if( settings.discardWhenHidden )
    {
        let td = MakeElement( 'td' );

        let cb;

        let title = `if this checkbox is checked, this group is not going to be discarded.`;

        if( tabGroups[id].noDiscard )
        {
            cb = MakeElement( 'input', { type: 'checkbox', class: `cNoDicard`, id: `groupNoDiscardID_${id}`, title: title, checked: `true` } );
        }
        else
        {
            cb = MakeElement( 'input', { type: 'checkbox', class: `cNoDicard`, id: `groupNoDiscardID_${id}`, title: title } );
        }

        td.appendChild( cb );

        tr.appendChild( td );
    }
    //#endregion
    
    //#region make tab group length
    td = MakeElement( 'td' );

    td.appendChild( document.createTextNode( `[${tabGroups[id].tabs.length}]`) );

    tr.appendChild( td );
    //#endregion

    //#region make tabgroup command button
    td = MakeElement( 'td' );

    btn = MakeElement( 'button', { class: 'cTabGroupMenuButton', id: `groupMenuID_${id}`, tabindex: "3" }, { 'font-weight': 'bold' }, '⋯' );

    td.appendChild( btn );

    tr.appendChild( td );
    //#endregion

    return tr;
}

function CreateTabGroupsHtml()
{
    function MakeRow( div, gid )
    {
        let name = tabGroups[gid].name;
        let tabs = tabGroups[gid].tabs;

        if( gid == state.currentGroup )
        {
            div.appendChild( MakeTabGroupRow( name, gid, true ) );
        }
        else
        {
            div.appendChild( MakeTabGroupRow( name, gid ) );
        }
    }

    SetEmPixel();

    let div = document.getElementById( "tbl_tabGroupList" );

    ClearNode( div );

    let count = 0;

    let initialIdx = tabGroupsPager.current * tabGroupsPager.max;

    for( let i = initialIdx; i < state.tabGroupsOrder.length; i++ )
    {
        count++;

        MakeRow( div, state.tabGroupsOrder[i] );

        if( count == tabGroupsPager.max )
        {
            break;
        }
    }

    if( div.clientHeight > tabGroupTableMaxHeight )
    {
        tabGroupTableMaxHeight = div.clientHeight;
    }

    div.style["height"] = `${tabGroupTableMaxHeight}px`;

    MakePagerArea();

    RefreshTabGroupList();

    if( settings.showAdvancedButtons )
    {
        document.getElementById( "div_advencedButtons" ).className = "";
    }
    
    initDone = true;
}
//#endregion

//#region pager functions/listners
function MakePagerArea()
{
    let pages = Math.ceil( state.tabGroupsOrder.length / tabGroupsPager.max );

    let naviArea = document.getElementById( "div_tabGroupListNavi" );

    ClearNode( naviArea );  

    if( pages > 1 )
    {
        //make back button
        if( tabGroupsPager.current > 0 )
        {
            let btn = MakeElement( 'button', { id: 'pagerPrev'} );

            let img = MakeElement( 'img', { class: 'cButtons', src: '../Resources/mark_leftTriangle.svg' } );

            btn.appendChild( img );

            naviArea.appendChild( btn );
        }
        else
        {
            let btn = MakeElement( 'button', { class: 'cDummyButton' } );

            let img = MakeElement( 'img', { class: 'cButtons', src: '../Resources/mark_dummy.svg' } );

            btn.appendChild( img );

            naviArea.appendChild( btn );
        }

        //make number button
        for( let i = 0; i < pages; i++ )
        {
            let btn;

            if( tabGroupsPager.current == i )
            {
                btn = MakeElement( 'button', {}, { 'font-weight': 'bold' }, `[${i}]` );
            }
            else
            {
                btn = MakeElement( 'button', { class: 'cPagerNumber', 'data-pagerNumber': `${i}` }, { }, `[${i}]` );
            }

            naviArea.appendChild( btn );
        }

        //make next button
        if( tabGroupsPager.current < ( pages - 1 ) )
        {
            let btn = MakeElement( 'button', { id: 'pagerNext' } );

            let img = MakeElement( 'img', { class: 'cButtons', src: '../Resources/mark_rightTriangle.svg' } );

            btn.appendChild( img );

            naviArea.appendChild( btn );
        }
        else
        {
            let btn = MakeElement( 'button', { class: 'cDummyButton' } );

            let img = MakeElement( 'img', { class: 'cButtons', src: '../Resources/mark_dummy.svg' } );

            btn.appendChild( img );

            naviArea.appendChild( btn );
        }
    }

    SetPagerListeners();
}

function SetPagerListeners()
{
    let collection = document.getElementsByClassName( "cPagerNumber" );

    for( let elem of collection )
    {
        elem.addEventListener( "click", PagerNumblerOnClicked );
    }

    let next = document.getElementById( "pagerNext" );

    let prev = document.getElementById( "pagerPrev");

    if( next )
    {
        next.addEventListener( "click", PagerNextOnClicked );
    } 

    if( prev )
    {
        prev.addEventListener( "click", PagerPreviousOnClicked );
    }
}
function PagerNumblerOnClicked( ev ) 
{
    let data = ev.target.getAttribute( "data-pagerNumber" );

    tabGroupsPager.current = Number( data );

    CreateTabGroupsHtml();
}
function PagerNextOnClicked( ev )
{
    tabGroupsPager.current++;

    CreateTabGroupsHtml();
}
function PagerPreviousOnClicked( ev )
{
    tabGroupsPager.current--;

    CreateTabGroupsHtml();
}

//#endregion

//#region setting functions
function OnSettingClicked()
{
    let elem = document.getElementById( "div_settingList" );

    let cb_discardWhenHidden = document.getElementById( "cb_settingDiscardWhenHidden" );

    let cb_muteWhenHidden = document.getElementById( "cb_settingMuteWhenHidden" );

    let cb_debug = document.getElementById( "cb_debug" );

    let cb_showAdvancedButtons = document.getElementById( "cb_showAdvancedButtons" );

    let cb_settingAutoClosePopup = document.getElementById( "cb_settingAutoClosePopup" );

    //close setting
    if( elem.className != "cHidden" )
    {
        elem.className = "cHidden";
        return;
    }

    //show setting
    cb_discardWhenHidden.checked = settings.discardWhenHidden;

    cb_muteWhenHidden.checked = settings.muteWhenHidden;

    cb_debug.checked = settings.debug;

    cb_showAdvancedButtons.checked = settings.showAdvancedButtons;

    cb_settingAutoClosePopup.checked = settings.autoClosePopup;

    cb_discardWhenHidden.addEventListener( "change", ev => {
        port.postMessage( { msg: bgMsg.SetDiscardWhenHidden, data: ev.target.checked } );
    } );

    cb_muteWhenHidden.addEventListener( "change", ev => { 
        port.postMessage( { msg: bgMsg.SetMuteWhenHidden, data: ev.target.checked } );
    } );

    cb_debug.addEventListener( "change", ev => {
        port.postMessage( { msg: bgMsg.SetDebug, data: ev.target.checked } );
    } );

    cb_showAdvancedButtons.addEventListener( "change", ev => {  
        port.postMessage( { msg: bgMsg.SetShowAdvancedButtons, data: ev.target.checked } );
    } );

    cb_settingAutoClosePopup.addEventListener( "change", ev => { 
        port.postMessage( { msg: bgMsg.SetAutoClosePopup, data: ev.target.checked } );
    } );

    elem.className = "";
}

function OnMuteClicked( ev )
{
    let id = ev.target.id.substr( "groupMuteID_".length );
    port.postMessage( { msg:bgMsg.MuteTabGroup, data:id } );
}

function OnUnmuteClicked( ev )
{
    let id = ev.target.id.substr( "groupMuteID_".length );
    port.postMessage( { msg:bgMsg.UnmuteTabGroup, data:id } );
}

function OnNoDiscardChanged( ev )
{
    let id = ev.target.id.substr( "groupNoDiscardID_".length );

    port.postMessage( { msg:bgMsg.SetNoDicard, data:{ groupId:id, value: ev.target.checked } } );
}
//#endregion

//#region advanced button functions
function OnResetAllClicked()
{
    if( confirm( "are you sure" ) )
    {
        port.postMessage( { msg:bgMsg.ResetAll } );
    }
}

function OnDiscardClicked()
{
    port.postMessage( { msg:bgMsg.DiscardOneTime } );
}
//#endregion

//#region tab group menu functions
function OnTabGroupMenuClicked( ev )
{
    let elem = document.getElementById( "div_tabGroupMenu" );

    let wrapper = document.getElementById( "wrapper" );

    let targetId = ev.target.id.substr( "groupMenuID_".length );

    //show menu
    elem.className = "cTabGroupMenu";

    //set menu position, change wrapper size
    let totalHeight = elem.clientHeight + ev.clientY;

    if( totalHeight >= wrapper.clientHeight )
    {
        wrapper.style["height"] = ( totalHeight + 5 ) + "px";
    }
    else
    {
        wrapper.style["height"] = "auto";
    }

    elem.style["top"] = ev.clientY + "px";

    elem.style["left"] = ( ev.clientX - elem.clientWidth ) + "px";

    //add listeners
    elem.addEventListener( "mouseleave", OnTabGroupMenuMouseleave );

    elem.setAttribute( "data-groupId", targetId );

    SwitchMenuButtonListeners( true );
}

function OnTabGroupMenuMouseleave( ev )
{
    ev.target.removeEventListener( "mouseleave", OnTabGroupMenuMouseleave );

    ev.target.className = "cTabGroupMenu cHidden";

    let wrapper = document.getElementById( "wrapper" );

    wrapper.style["height"] = "auto";

    SwitchMenuButtonListeners( false );
}

function SwitchMenuButtonListeners( add = true )
{
    let btn_rowUp = document.getElementById( "btn_tabGroupMenuRowUp");

    let btn_rowDown = document.getElementById( "btn_tabGroupMenuRowDown");

    let btn_remove = document.getElementById( "btn_tabGroupMenuRemove");

    if( add )
    {
        btn_rowUp.addEventListener( "click", TabGroupMenuRowUpListener );

        btn_rowDown.addEventListener( "click", TabGroupMenuRowDownListener );

        btn_remove.addEventListener( "click", TabGroupMenuRemoveListener );
    }
    else
    {
        btn_rowUp.removeEventListener( "click", TabGroupMenuRowUpListener );

        btn_rowDown.removeEventListener( "click", TabGroupMenuRowDownListener );

        btn_remove.removeEventListener( "click", TabGroupMenuRemoveListener );
    }
    
}

function TabGroupMenuRowUpListener( ev )
{
    let targetId = document.getElementById( "div_tabGroupMenu" ).getAttribute( "data-groupId" );

    ChangeTabGroupsOrder( targetId, "up" );
}

function TabGroupMenuRowDownListener( ev )
{
    let targetId = document.getElementById( "div_tabGroupMenu" ).getAttribute( "data-groupId" );

    ChangeTabGroupsOrder( targetId, "down" );
}

function TabGroupMenuRemoveListener( ev )
{
    let targetId = document.getElementById( "div_tabGroupMenu" ).getAttribute( "data-groupId" );

    RemoveTab( targetId );
}
//#endregion

//#region auto close functions
var AutoCloseMouseEnterFlag = false;

function AutoCloseMouseLeave( ev )
{
    document.body.addEventListener( "mouseenter", AutoCloseMouseEnter );
    document.body.removeEventListener( "mouseleave", AutoCloseMouseLeave );

    AutoCloseTOiid = setTimeout( ev => {
        if( !AutoCloseMouseEnterFlag )
        {
            window.close();
        }
        else
        {
            AutoCloseMouseEnterFlag = false;
            document.body.addEventListener( "mouseleave", AutoCloseMouseLeave );
            document.body.removeEventListener( "mouseenter", AutoCloseMouseEnter );
        }
    }, 500 );
}

function AutoCloseMouseEnter( ev )
{
    AutoCloseMouseEnterFlag = true;
}

function AutoCloseResizeListner( ev )
{
    document.body.removeEventListener( "mouseleave", AutoCloseMouseLeave );

    this.setTimeout( ev => { 
        document.body.addEventListener( "mouseleave", AutoCloseMouseLeave );
    }, 50 );
}

function SetAutoClose( bClose = false )
{
    if( bClose )
    {
       window.addEventListener( "resize", AutoCloseResizeListner );
       document.body.addEventListener( "mouseleave", AutoCloseMouseLeave );
    }
    else
    {
       window.removeEventListener( "resize", AutoCloseResizeListner );
       document.body.removeEventListener( "mouseleave", AutoCloseMouseLeave );
    }
}
//#endregion

window.onload = async function() 
{
    //connect to background
    port = browser.runtime.connect( { name:"@simplifiedtabgroup" } );

    port.onDisconnect.addListener( m => { 
        console.error( "server port: disconnected" );
    } );

    port.onMessage.addListener( obj => {
        dlog( `background message`, obj );
        switch( obj.msg )
        {
            case bgMsg.GetInfos:
            {
                if( !obj.data.succeeded )
                {
                    Notice( `GetInfos failed: ${obj.data.err}`);

                    return;
                }

                settings = obj.data.settings;

                state = obj.data.state;

                tabGroups = obj.data.tabGroups;

                CreateTabGroupsHtml();

                SetAutoClose( settings.autoClosePopup );

                break;
            }
            case bgMsg.TabGroupUpdated:
            {
                tabGroups = obj.data;

                CreateTabGroupsHtml();

                break;
            }
            case bgMsg.SetGroupName:
            {
                if( !obj.data.succeeded )
                {
                    Notice( `SetGroupName failed: ${obj.data.err}` );

                    return;
                }
            
                Notice( `${obj.data.oldname} renamed to ${obj.data.newname}` );

                document.getElementById( `groupID_${obj.data.id}` ).value = obj.data.newname;

                tabGroups[obj.data.id].name = obj.data.newname;

                break;
            }
            case bgMsg.AddNewGroup:
            {
                if( !obj.data.succeeded )
                {
                    Notice( `AddNewGroup failed: ${obj.data.err}` );

                    return;
                }

                Notice( "A new group is added.");

                port.postMessage( { msg: bgMsg.GetInfos } );

                break;
            }
            case bgMsg.RemoveTabGroup:
            {
                if( !obj.data.succeeded )
                {
                    Notice( `RemoveTabGroup failed: ${obj.data.err}` );

                    return;
                }

                Notice( `${tabGroups[obj.data.id].name} is removed.` );

                tabGroupTableMaxHeight = 0;

                port.postMessage( { msg: bgMsg.GetInfos } );

                break;
            }
            case bgMsg.SetCurrentGroup:
            {
                if( !obj.data.succeeded )
                {
                    Notice( `SetCurrentGroup failed: ${obj.data.err}`);

                    return;
                }

                state.currentGroup = obj.data.currentGroup;

                tabGroups = obj.data.tabGroups;

                CreateTabGroupsHtml();

                break;
            }
            case bgMsg.DiscardOneTime:
            {
                if( !obj.data.succeeded )
                {
                    Notice( `DiscardOneTime failed: ${obj.data.err}` );
                }

                Notice( `Hidden tabs are discarded.` );

                break;
            }
            case bgMsg.ResetAll:
            {
                if( !obj.data.succeeded )
                {
                    Notice( `ResetAll failed: ${obj.data.err}` );

                    return;
                }

                Notice( 'ResetAll' );

                tabGroupTableMaxHeight = 0;

                port.postMessage( { msg: bgMsg.GetInfos } );

                break;
            }
            case bgMsg.MuteTabGroup:
            {
                if( !obj.data.succeeded )
                {
                    Notice( `MuteTabGroup failed: ${obj.data.err}` );

                    return;
                }

                let id = "groupMuteID_"+obj.data.id;

                let elem = document.getElementById( id );

                elem.className = "cUnmuteTabGroup";

                ClearNode( elem );

                elem.appendChild( MakeElement( 'img', { class: 'cButtons', src: '../Resources/mark_speakerMuted.svg' } ) );

                elem.removeEventListener( "click", OnMuteClicked );

                elem.addEventListener( "click", OnUnmuteClicked );

                tabGroups[obj.data.id].muted = true;

                break;
            }               
            case bgMsg.UnmuteTabGroup:
            {
                if( !obj.data.succeeded )
                {
                    Notice( `UnmuteTabGroup failed: ${obj.data.err}` );

                    return;
                }

                let id = "groupMuteID_"+obj.data.id;

                let elem = document.getElementById( id );

                elem.className = "cMuteTabGroup";

                ClearNode( elem );

                elem.appendChild( MakeElement( 'img', { class: 'cButtons', src: '../Resources/mark_speaker.svg' } ) );

                elem.removeEventListener( "click", OnUnmuteClicked );

                elem.addEventListener( "click", OnMuteClicked );

                tabGroups[obj.data.id].muted = false;

                break;
            }
            case bgMsg.SetNoDicard:
            {
                if( !obj.data.succeeded )
                {
                    Notice( `SetNoDiscard failed: ${obj.data.err}` );

                    return;
                }

                tabGroups[obj.data.id].noDiscard = obj.data.noDiscard;

                break;
            }
            //settings
            case bgMsg.SetDiscardWhenHidden:
            {
                if( !obj.data.succeeded )
                {
                    Notice( `SetDiscardWhenHidden failed: ${obj.data.err}` );

                    return;
                }

                settings.discardWhenHidden = obj.data.discardWhenHidden;

                CreateTabGroupsHtml();

                break;
            }
            case bgMsg.SetMuteWhenHidden:
            {
                if( !obj.data.succeeded )
                {
                    Notice( `SetMuteWhenHidden failed: ${obj.data.err}` );

                    return;
                }

                settings.muteWhenHidden = obj.data.muteWhenHidden;

                break;
            }
            case bgMsg.SetDebug:
            {
                if( !obj.data.succeeded )
                {
                    Notice( `SetDebug failed: ${obj.data.err}` );

                    return;
                }

                settings.debug = obj.data.debug;

                break;
            }
            case bgMsg.SetShowAdvancedButtons:
            {
                if( !obj.data.succeeded )
                {
                    Notice( `SetShowAdvancedButtons failed: ${obj.data.err}` );

                    return;
                }

                settings.showAdvancedButtons = obj.data.showAdvancedButtons;

                let div = document.getElementById( "div_advencedButtons" );

                if( cb_showAdvancedButtons.checked )
                {
                    div.className = "";
                }
                else
                {
                    div.className = "cHidden";
                }

                break;
            }
            case bgMsg.SetAutoClosePopup:
            {
                if( !obj.data.succeeded )
                {
                    Notice( `SetAutoClosePopup failed: ${obj.data.err}` );

                    return;
                }

                settings.autoClosePopup = obj.data.autoClosePopup;
        
                SetAutoClose( settings.autoClosePopup );

                break;
            }
        }
    } );

    port.postMessage( { msg: bgMsg.GetInfos } );

    //add event listeners
    document.getElementById( "btn_addGroup" ).addEventListener( "click", AddGroup );

    document.getElementById( "btn_setting").addEventListener( "click", OnSettingClicked );

    document.getElementById( "btn_discardOnetime").addEventListener( "click", OnDiscardClicked );

    document.getElementById( "btn_resetAll").addEventListener( "click", OnResetAllClicked );
}