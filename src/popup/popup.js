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

var state = 
{ 
    currentGroup:""
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

function RemoveTabGroup( ev )
{
    if( Object.keys( tabGroups ).length == 1 )
    {
        Notice( "Can not remove the last group.");
        return;
    }
    var id = ev.target.id.substr( "groupID_".length );

    if( confirm( `Remove "${ tabGroups[id].name }" group?\r\n( contains ${tabGroups[id].tabs.length == 0 ? 1 : tabGroups[id].tabs.length } tabs. )` ) )
    {
        port.postMessage( { msg:bgMsg.RemoveTabGroup, data:{ "id":id } } );
    }
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

    collection = document.getElementsByClassName( "cRemoveTabGroup" );

    for( let elem of collection )
    {
        elem.addEventListener( "click", RemoveTabGroup );
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
    var ret = `<tr id="groupRowID_${id}">`;

    if( currentGroup )
    {
        ret += `<td><button class="cCurrentGroupMark" id="groupMarkID_${id}" tabindex="2">&#8594;</button></td>`;
    }
    else
    {
        ret += `<td><button class="cCurrentGroupMark" id="groupMarkID_${id}" tabindex="2">&#9675;</button></td>`;
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
        <td>[${tabGroups[id].tabs.length == 0 ? 1 : tabGroups[id].tabs.length }]</td>
        <td><button class="cRemoveTabGroup" id="groupID_${id}" tabindex="3">Remove</button></td>
    `
    
    ret += `</tr>`
    return ret;
}

function CreateTabGroupsHtml()
{
    var tabGroupIDs = Object.keys( tabGroups );

    var div = document.getElementById( "tbl_tabGroupList" );

    div.innerHTML = "";

    tabGroupIDs.forEach( tabGroupID => {
        
        var groupName = tabGroups[tabGroupID].name;
        var tabs      = tabGroups[tabGroupID].tabs;

        if( tabGroupID == state.currentGroup )
        {
            div.innerHTML += MakeTabGroupRow( groupName, tabGroupID, true );
        }
        else
        {
            div.innerHTML += MakeTabGroupRow( groupName, tabGroupID );
        }
        
    } );

    RefreshTabGroupList();
    
    initDone = true;
}

function AddGroup()
{
    if( !initDone )
    {
        return;
    }

    port.postMessage( { msg:bgMsg.AddNewGroup } );
}

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
        port.postMessage( { msg: bgMsg.SetDiscardWhenHidden, data: cb_discardWhenHidden.checked } );
    } );

    cb_muteWhenHidden.addEventListener( "change", ev => { 
        port.postMessage( { msg: bgMsg.SetMuteWhenHidden, data: cb_muteWhenHidden.checked } );
    } );

    cb_debug.addEventListener( "change", ev => {
        port.postMessage( { msg: bgMsg.SetDebug, data: cb_debug.checked } );
    } );

    cb_showAdvancedButtons.addEventListener( "change", ev => {  
        port.postMessage( { msg: bgMsg.SetShowAdvancedButtons, data: cb_showAdvancedButtons.checked } );

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
        port.postMessage( { msg: bgMsg.SetAutoClosePopup, data: cb_settingAutoClosePopup.checked } );
        
        SetAutoClose( cb_settingAutoClosePopup.checked );
    } );

    elem.className = "";
}

function OnDiscardClicked()
{
    port.postMessage( { msg:bgMsg.DiscardOneTime } );
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

function OnResetAllClicked()
{
    if( confirm( "are you sure" ) )
    {
        port.postMessage( { msg:bgMsg.ResetAll } );
    }
}

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
    }, 5 );
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

window.onload = async function() 
{
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

                state.currentGroup = obj.data.currentGroup;

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

                tabGroups = obj.data.tabGroups;

                CreateTabGroupsHtml();

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
                if( obj.data.succeeded )
                {
                    window.close();
                }
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

    document.getElementById( "btn_addGroup" ).addEventListener( "click", AddGroup );
    document.getElementById( "btn_setting").addEventListener( "click", OnSettingClicked );
    document.getElementById( "btn_discardOnetime").addEventListener( "click", OnDiscardClicked );
    document.getElementById( "btn_resetAll").addEventListener( "click", OnResetAllClicked );
}