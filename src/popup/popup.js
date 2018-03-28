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
    var elem = document.getElementById( "div_notice" );
    elem.innerHTML = msg;
    setInterval( ev => {
        elem.innerHTML = "";
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
    var ret = `<tr id="groupRowID_${id}" class="cTabGroupRow">`;

    if( currentGroup )
    {
        ret += `<td><button class="cCurrentGroupMark" id="groupMarkID_${id}" style="font-weight:bold;font-size:larger;" tabindex="2">&#9656;</button></td>`;
    }
    else
    {
        ret += `<td><button class="cCurrentGroupMark" id="groupMarkID_${id}" style="font-weight:bold;font-size:larger; tabindex="2">&#9675;</button></td>`;
    }
    
    ret += `<td><input type="text" class="cGroupNameInput" id="groupID_${id}" tabindex="1"></td>`;

    if( tabGroups[id].muted )
    {
        ret += `<td><button class="cUnmuteTabGroup" id="groupMuteID_${id}" tabindex="3">&#128263;</button></td>`
    }
    else if( tabGroups[id].audibleTabs.length != 0 )
    {
        ret += `<td><button class="cMuteTabGroup" id="groupMuteID_${id}" tabindex="3">&#128266;</button></td>`
    }
    else
    {
        ret += `<td></td>`;
    }

    if( settings.discardWhenHidden )
    {
        let checked = tabGroups[id].noDiscard ? "checked" : "";
        
        ret += `<td><input type="checkbox" ${checked} class="cNoDicard" id="groupNoDiscardID_${id}" title="if this checkbox is checked, this group is not going to be discarded."></td>`;
    }

    ret += `
        <td><span class="cText">[${tabGroups[id].tabs.length == 0 ? 1 : tabGroups[id].tabs.length }]</span></td>
        <td><button style="font-weight:bold;" id="groupMenuID_${id}" tabindex="3" class="cTabGroupMenuButton" >&#8943;</button></td> 
    `;

    ret += `</tr>`

    return ret;
}

function CreateTabGroupsHtml()
{
    function MakeRow( div, gid )
    {
        let name = tabGroups[gid].name;
        let tabs = tabGroups[gid].tabs;

        if( gid == state.currentGroup )
        {
            div.innerHTML += MakeTabGroupRow( name, gid, true );
        }
        else
        {
            div.innerHTML += MakeTabGroupRow( name, gid );
        }
    }

    let div = document.getElementById( "tbl_tabGroupList" );

    div.innerHTML = "";

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

    if( pages > 1 )
    {
        let naviArea = document.getElementById( "div_tabGroupListNavi" );

        let html = ``;

        if( tabGroupsPager.current > 0 )
        {
            html += `<button style="font-size:x-large;" id="pagerPrev">&#9666;</button>`;    
        }

        for( let i = 0; i < pages; i++ )
        {
            if( tabGroupsPager.current == i )
            {
                html += `<button style="font-weight:bold;">[${i}]</button> `;
            }
            else
            {
                html += `<button class="cPagerNumber" data-pagerNumber="${i}">[${i}]</button> `;
            }   
        }

        if( tabGroupsPager.current < ( pages - 1 ) )
        {
            html += `<button style="font-size:x-large;" id="pagerNext">&#9656;</button>`;
        }

        naviArea.innerHTML = html;
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

        settings.discardWhenHidden = ev.target.checked;
    } );

    cb_muteWhenHidden.addEventListener( "change", ev => { 
        port.postMessage( { msg: bgMsg.SetMuteWhenHidden, data: ev.target.checked } );

        settings.muteWhenHidden = ev.target.checked;
    } );

    cb_debug.addEventListener( "change", ev => {
        port.postMessage( { msg: bgMsg.SetDebug, data: ev.target.checked } );

        settings.debug = ev.target.checked;
    } );

    cb_showAdvancedButtons.addEventListener( "change", ev => {  
        port.postMessage( { msg: bgMsg.SetShowAdvancedButtons, data: ev.target.checked } );

        settings.showAdvancedButtons = ev.target.checked;

        let div = document.getElementById( "div_advencedButtons" );

        if( cb_showAdvancedButtons.checked )
        {
            div.className = "";
        }
        else
        {
            div.className = "cHidden";
        }
    } );

    cb_settingAutoClosePopup.addEventListener( "change", ev => { 
        port.postMessage( { msg: bgMsg.SetAutoClosePopup, data: ev.target.checked } );

        settings.autoClosePopup = ev.target.checked;
        
        SetAutoClose( ev.target.checked );
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
    let value = ev.target.checked;

    let id = ev.target.id.substr( "groupNoDiscardID_".length );

    port.postMessage( { msg:bgMsg.SetNoDicard, data:{ groupId:id, value:value } } );
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
    }, 100 );
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
                    Notice( `Failed to GetInfos. <br>err: ${obj.data.err}`);

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
                    Notice( `Failed to rename. ${obj.data.oldname} to ${obj.data.newname}. <br>${obj.data.err}` );

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
                    Notice( `Failed to add a new group. ${obj.data.err}` );

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
                    Notice( `Failed to remove a group. ${obj.data.err}` );

                    return;
                }

                Notice( `${tabGroups[obj.data.id].name} is removed.` );

                port.postMessage( { msg: bgMsg.GetInfos } );

                break;
            }
            case bgMsg.SetCurrentGroup:
            {
                if( !obj.data.succeeded )
                {
                    Notice( `Failed to switch current group. ${obj.data.err}`);

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
                    Notice( `Failed to discard tabs. ${obj.data.err}` );
                }

                Notice( `Hidden tabs are discarded.` );

                break;
            }
            case bgMsg.ResetAll:
            {
                if( !obj.data.succeeded )
                {
                    Notice( `ResetAll failed. ${obj.data.err}` );

                    return;
                }
                Notice( `ResetAll succeeded.` );

                port.postMessage( { msg: bgMsg.GetInfos } );

                break;
            }
            case bgMsg.MuteTabGroup:
            {
                if( !obj.data.succeeded )
                {
                    Notice( obj.data.err );

                    return;
                }

                let id = "groupMuteID_"+obj.data.id;

                let elem = document.getElementById( id );

                elem.className = "cUnmuteTabGroup";

                elem.innerHTML = "&#128263;";

                elem.removeEventListener( "click", OnMuteClicked );

                elem.addEventListener( "click", OnUnmuteClicked );
                break;
            }               
            case bgMsg.UnmuteTabGroup:
            {
                if( !obj.data.succeeded )
                {
                    Notice( obj.data.err );

                    return;
                }

                let id = "groupMuteID_"+obj.data.id;

                let elem = document.getElementById( id );

                elem.className = "cMuteTabGroup";

                elem.innerHTML = "&#128266;";

                elem.removeEventListener( "click", OnUnmuteClicked );

                elem.addEventListener( "click", OnMuteClicked );
                break;
            }
            case bgMsg.SetDiscardWhenHidden:
            {
                settings.discardWhenHidden = obj.data;

                CreateTabGroupsHtml();

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